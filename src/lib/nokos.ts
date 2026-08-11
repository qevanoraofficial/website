import "server-only";
import type { Product } from "@/types/catalog";

export type NokosService = {
  code: string;
  name: string;
};

export type NokosCountry = {
  id: number;
  name: string;
  prefix?: string;
};

type NokosPriceEntry = {
  cost?: string | number;
  count?: string | number;
};

type NokosApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  result?: T;
  [key: string]: unknown;
};

export type NokosActivation = {
  activation_id: string | number;
  phone: string;
  price?: string | number;
  expires_at?: string;
  [key: string]: unknown;
};

export type NokosStatus = {
  status?: string;
  code?: string | number;
  sms?: string;
  [key: string]: unknown;
};

type CatalogChoice = {
  service: NokosService;
  country: NokosCountry;
  server: "s1" | "s2";
  providerPrice: number;
  stock: number;
};

type CachedReference = {
  expiresAt: number;
  services: NokosService[];
  countries: NokosCountry[];
};

let referenceCache: CachedReference | null = null;
const priceCache = new Map<string, { expiresAt: number; data: Record<string, NokosPriceEntry> }>();

function baseUrl() {
  return String(process.env.NOKOS_API_URL || "https://nokos.co.id/api/").trim();
}

function apiKey() {
  const key = String(process.env.NOKOS_API_KEY || "").trim();
  if (!key) throw new Error("NOKOS_API_KEY belum diatur di Vercel.");
  return key;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function int(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function describeShape(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (isRecord(first)) return `array(itemKeys:${Object.keys(first).slice(0, 10).join(",") || "none"})`;
    if (Array.isArray(first)) return `array(tupleLength:${first.length})`;
    return `array(itemType:${typeof first})`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).slice(0, 10);
    const firstValue = keys.length ? value[keys[0]] : undefined;
    if (isRecord(firstValue)) {
      return `object(keys:${keys.join(",") || "none"}; valueKeys:${Object.keys(firstValue).slice(0, 10).join(",") || "none"})`;
    }
    return `object(keys:${keys.join(",") || "none"}; valueType:${typeof firstValue})`;
  }
  return typeof value;
}

function normalizeServices(raw: unknown): NokosService[] {
  const output: NokosService[] = [];

  const add = (value: unknown, fallbackCode = "") => {
    let code = "";
    let name = "";

    if (typeof value === "string" || typeof value === "number") {
      code = fallbackCode.trim();
      name = String(value).trim();
      if (!code && name) code = name;
    } else if (Array.isArray(value)) {
      code = String(value[0] ?? fallbackCode).trim();
      name = String(value[1] ?? value[0] ?? "").trim();
    } else if (isRecord(value)) {
      code = firstText(value, ["code", "service", "service_code", "id", "key", "slug"]) || fallbackCode.trim();
      name = firstText(value, ["name", "title", "service_name", "label", "text", "display_name"]);
      if (!name && code && value[code] !== undefined) name = String(value[code] ?? "").trim();
    }

    if (code && name) output.push({ code, name });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) add(item);
  } else if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) add(value, key);
  }

  return Array.from(new Map(output.map((item) => [item.code, item])).values());
}

function normalizeCountries(raw: unknown): NokosCountry[] {
  const output: NokosCountry[] = [];

  const add = (value: unknown, fallbackId?: string) => {
    let idValue: unknown = fallbackId;
    let name = "";
    let prefix = "";

    if (typeof value === "string" || typeof value === "number") {
      name = String(value).trim();
    } else if (Array.isArray(value)) {
      idValue = value[0] ?? fallbackId;
      name = String(value[1] ?? "").trim();
      prefix = String(value[2] ?? "").trim();
    } else if (isRecord(value)) {
      idValue = value.id ?? value.country ?? value.country_id ?? value.code ?? fallbackId;
      name = firstText(value, ["name", "title", "country_name", "eng", "en", "label", "display_name"]);
      prefix = firstText(value, ["prefix", "dial_code", "phone_code", "calling_code", "dialCode"]);
    }

    const id = int(idValue, Number.NaN);
    if (Number.isFinite(id) && name) output.push({ id, name, prefix });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) add(item);
  } else if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) add(value, key);
  }

  return Array.from(new Map(output.map((item) => [item.id, item])).values());
}

function sanitizeError(message: string) {
  const text = message.trim();
  if (/NO_NUMBERS/i.test(text)) return "Stok nomor sedang kosong untuk layanan ini.";
  if (/insufficient balance/i.test(text)) return "Saldo supplier sedang tidak cukup. Silakan coba lagi nanti.";
  if (/invalid api|api key/i.test(text)) return "Layanan nomor sedang mengalami kendala konfigurasi.";
  if (/rate limit|too many/i.test(text)) return "Permintaan terlalu cepat. Silakan coba lagi beberapa saat.";
  return text || "Layanan nomor sedang mengalami kendala.";
}

async function nokosRequest<T>(
  action: string,
  options?: {
    method?: "GET" | "POST";
    query?: Record<string, string | number>;
    body?: Record<string, string | number>;
    idempotencyKey?: string;
  },
): Promise<T> {
  const url = new URL(baseUrl());
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(options?.query || {})) {
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-API-Key": apiKey(),
  };
  let body: string | undefined;
  if (options?.method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(
      Object.entries(options.body || {}).map(([key, value]) => [key, String(value)]),
    ).toString();
  }
  if (options?.idempotencyKey) {
    headers["X-Idempotency-Key"] = options.idempotencyKey.slice(0, 100);
  }

  const response = await fetch(url.toString(), {
    method: options?.method || "GET",
    headers,
    body,
    cache: "no-store",
  });

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Nokos ${action} mengembalikan respons non-JSON (HTTP ${response.status}).`);
  }

  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as NokosApiEnvelope<T>)
      : null;

  if (!response.ok || payload?.success === false || payload?.error) {
    const reason = sanitizeError(
      String(payload?.error || payload?.message || `HTTP ${response.status}`),
    );
    throw new Error(`Nokos ${action} gagal (HTTP ${response.status}): ${reason}`);
  }

  // Format resmi Nokos: { success: true, data: ... }
  if (payload && payload.data !== undefined) return payload.data;

  // Compatibility: beberapa implementasi API mengembalikan result / alias top-level / raw array.
  if (payload && payload.result !== undefined) return payload.result as T;
  if (Array.isArray(parsed)) return parsed as T;

  if (payload) {
    const aliases: Record<string, string[]> = {
      getBalance: ["balance"],
      getServices: ["services", "service"],
      getCountries: ["countries", "country"],
      getPrices: ["prices", "price"],
      getAvailability: ["availability", "stock"],
      getNumber: ["activation", "number", "order"],
      getStatus: ["status"],
      getHistory: ["history", "items"],
      createDeposit: ["deposit", "transaction"],
      checkDeposit: ["deposit", "transaction"],
    };

    for (const key of aliases[action] || []) {
      if (payload[key] === undefined) continue;
      if (action === "getBalance" && key === "balance") {
        return { balance: payload[key] } as T;
      }
      if (action === "getStatus" && key === "status" && typeof payload[key] === "string") {
        return payload as T;
      }
      return payload[key] as T;
    }

    // Jika respons bukan envelope resmi tetapi berupa object data langsung, tetap terima.
    const isEnvelopeLike =
      "success" in payload || "error" in payload || "message" in payload || "data" in payload;
    if (!isEnvelopeLike) return payload as T;

    const keys = Object.keys(payload).filter((key) => key !== "data").slice(0, 8);
    throw new Error(
      `Nokos ${action} mengembalikan JSON tanpa data (HTTP ${response.status}; keys: ${
        keys.join(",") || "none"
      }).`,
    );
  }

  throw new Error(`Nokos ${action} mengembalikan format respons yang tidak dikenali.`);
}

export function isNokosConfigured() {
  return Boolean(String(process.env.NOKOS_API_KEY || "").trim());
}

export async function getNokosBalance() {
  return nokosRequest<{ balance?: string | number }>("getBalance");
}

export async function getNokosReference(options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && referenceCache && referenceCache.expiresAt > now) {
    return referenceCache;
  }

  const [servicesRaw, countriesRaw] = await Promise.all([
    nokosRequest<unknown>("getServices"),
    nokosRequest<unknown>("getCountries"),
  ]);

  const services = normalizeServices(servicesRaw);
  const countries = normalizeCountries(countriesRaw);

  if (services.length === 0) {
    throw new Error(`Nokos getServices berhasil tetapi format layanan tidak dikenali (${describeShape(servicesRaw)}).`);
  }
  if (countries.length === 0) {
    throw new Error(`Nokos getCountries berhasil tetapi format negara tidak dikenali (${describeShape(countriesRaw)}).`);
  }

  referenceCache = { expiresAt: now + 10 * 60 * 1000, services, countries };
  return referenceCache;
}

async function getPriceMap(country: number, server: "s1" | "s2"): Promise<Record<string, NokosPriceEntry>> {
  const cacheKey = `${country}:${server}`;
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await nokosRequest<Record<string, Record<string, NokosPriceEntry> | NokosPriceEntry>>("getPrices", {
    query: { country, server },
  });
  const nested = data?.[String(country)];
  let result: Record<string, NokosPriceEntry> = {};
  if (nested && typeof nested === "object" && !("cost" in nested)) {
    result = nested as Record<string, NokosPriceEntry>;
  } else {
    const flat = data as unknown as Record<string, NokosPriceEntry>;
    const looksFlat = Object.values(flat || {}).some((entry) => entry && typeof entry === "object" && ("cost" in entry || "count" in entry));
    result = looksFlat ? flat : {};
  }
  priceCache.set(cacheKey, { expiresAt: Date.now() + 30_000, data: result });
  return result;
}

function sellingPrice(providerPrice: number) {
  const percent = Math.max(0, num(process.env.NOKOS_MARKUP_PERCENT, 0));
  const flat = Math.max(0, num(process.env.NOKOS_MARKUP_FLAT, 0));
  return Math.max(1, Math.ceil(providerPrice * (1 + percent / 100) + flat));
}

function makeProductId(service: string, country: number, server: "s1" | "s2") {
  return `nokos:${encodeURIComponent(service)}:${country}:${server}`;
}

export function parseNokosProductId(productId: string) {
  const match = /^nokos:([^:]+):(\d+):(s1|s2)$/.exec(String(productId || "").trim());
  if (!match) return null;
  return {
    service: decodeURIComponent(match[1]),
    country: int(match[2]),
    server: match[3] as "s1" | "s2",
  };
}

function choiceToProduct(choice: CatalogChoice): Product {
  const price = sellingPrice(choice.providerPrice);
  return {
    id: makeProductId(choice.service.code, choice.country.id, choice.server),
    category: "nokos",
    categoryName: "Nokos",
    name: `${choice.service.name} - ${choice.country.name}`,
    shortDescription: `${choice.country.name}${choice.country.prefix ? ` (${choice.country.prefix})` : ""} • Stok ${choice.stock.toLocaleString("id-ID")}`,
    fullDescription: `Nomor virtual untuk ${choice.service.name}.\n\nNegara: ${choice.country.name}${choice.country.prefix ? ` (${choice.country.prefix})` : ""}\nStok tersedia: ${choice.stock.toLocaleString("id-ID")}\n\nNomor diberikan otomatis setelah pembayaran Saldo QEVANORA berhasil. OTP akan muncul otomatis di halaman notifikasi.`,
    description: `${choice.service.name} • ${choice.country.name}`,
    price,
    stock: choice.stock,
    active: choice.stock > 0,
    image: "/images/products/product-placeholder.svg",
    supplier: "nokos",
    supplierProductId: choice.service.code,
    providerRate: choice.providerPrice,
    providerCurrency: "IDR",
    nokosServiceCode: choice.service.code,
    nokosCountryId: choice.country.id,
    nokosCountryName: choice.country.name,
    nokosCountryPrefix: choice.country.prefix || "",
    nokosServer: choice.server,
  };
}

export async function getNokosCatalog(options?: {
  country?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { services, countries } = await getNokosReference();
  const defaultCountry = countries.find((item) => item.id === 6) || countries[0];
  if (!defaultCountry) throw new Error("Daftar negara belum tersedia.");

  const requestedCountry = int(options?.country, defaultCountry.id);
  const country = countries.find((item) => item.id === requestedCountry) || defaultCountry;
  const [s1, s2] = await Promise.all([
    getPriceMap(country.id, "s1").catch((): Record<string, NokosPriceEntry> => ({})),
    getPriceMap(country.id, "s2").catch((): Record<string, NokosPriceEntry> => ({})),
  ]);

  const search = String(options?.search || "").trim().toLowerCase();
  const rows: Product[] = [];
  for (const service of services) {
    if (search && !`${service.name} ${service.code}`.toLowerCase().includes(search)) continue;
    const candidates = (["s2", "s1"] as const)
      .map((server) => {
        const entry = (server === "s2" ? s2 : s1)[service.code];
        return {
          server,
          providerPrice: Math.max(0, num(entry?.cost)),
          stock: Math.max(0, int(entry?.count)),
        };
      })
      .filter((item) => item.providerPrice > 0 && item.stock > 0)
      .sort((a, b) => a.providerPrice - b.providerPrice || b.stock - a.stock);

    const selected = candidates[0];
    if (!selected) continue;
    rows.push(
      choiceToProduct({
        service,
        country,
        server: selected.server,
        providerPrice: selected.providerPrice,
        stock: selected.stock,
      }),
    );
  }

  rows.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "id-ID"));
  const page = Math.max(1, int(options?.page, 1));
  const limit = Math.min(60, Math.max(12, int(options?.limit, 24)));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;

  return {
    products: rows.slice(start, start + limit),
    countries,
    country,
    total,
    page: currentPage,
    totalPages,
  };
}

export async function getNokosProduct(productId: string): Promise<Product | null> {
  const parsed = parseNokosProductId(productId);
  if (!parsed) return null;
  const { services, countries } = await getNokosReference();
  const service = services.find((item) => item.code === parsed.service);
  const country = countries.find((item) => item.id === parsed.country);
  if (!service || !country) return null;

  const availability = await nokosRequest<{ available?: string | number; price?: string | number }>("getAvailability", {
    query: { service: parsed.service, country: parsed.country, server: parsed.server },
  });
  const providerPrice = Math.max(0, num(availability.price));
  const stock = Math.max(0, int(availability.available));
  if (!providerPrice) return null;

  return choiceToProduct({ service, country, server: parsed.server, providerPrice, stock });
}

export async function createNokosActivation(input: {
  service: string;
  country: number;
  server: "s1" | "s2";
  idempotencyKey: string;
}) {
  const data = await nokosRequest<NokosActivation>("getNumber", {
    method: "POST",
    body: {
      service: input.service,
      country: input.country,
      server: input.server,
    },
    idempotencyKey: input.idempotencyKey,
  });

  const activationId = String(data.activation_id || "").trim();
  const phone = String(data.phone || "").trim();
  if (!activationId || !phone) throw new Error("Nomor gagal diterbitkan. Saldo akan dikembalikan.");
  return { ...data, activation_id: activationId, phone };
}

export async function getNokosActivationStatus(activationId: string) {
  return nokosRequest<NokosStatus>("getStatus", { query: { id: activationId } });
}

export async function finishNokosActivation(activationId: string) {
  return nokosRequest<Record<string, unknown>>("setStatus", {
    method: "POST",
    body: { id: activationId, status: 6 },
  });
}

export async function cancelNokosActivation(activationId: string) {
  return nokosRequest<Record<string, unknown>>("cancelActivation", {
    method: "POST",
    body: { id: activationId },
  });
}
