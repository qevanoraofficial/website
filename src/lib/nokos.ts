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
const servicePriceCache = new Map<string, { expiresAt: number; data: Record<number, NokosPriceEntry> }>();

const TRANSIENT_NOKOS_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

export class NokosProviderError extends Error {
  action: string;
  status: number | null;
  ambiguous: boolean;

  constructor(
    message: string,
    options?: { action?: string; status?: number | null; ambiguous?: boolean },
  ) {
    super(message);
    this.name = "NokosProviderError";
    this.action = String(options?.action || "");
    const parsedStatus =
      options?.status === null || options?.status === undefined
        ? null
        : Number(options.status);
    this.status =
      parsedStatus !== null && Number.isFinite(parsedStatus) ? parsedStatus : null;
    this.ambiguous = Boolean(options?.ambiguous);
  }

  get transient() {
    return (
      (this.status !== null && TRANSIENT_NOKOS_HTTP.has(this.status)) ||
      /timeout|timed out|network|fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket|aborted/i.test(
        this.message,
      )
    );
  }
}

export function isAmbiguousNokosError(error: unknown) {
  if (error instanceof NokosProviderError) {
    return error.ambiguous || error.transient;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /timeout|timed out|network|fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket|aborted|Permintaan terlalu cepat|respons non-JSON|JSON tanpa data|format respons yang tidak dikenali|HTTP (?:408|425|429|5\d\d)/i.test(
    message,
  );
}

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

/**
 * Nokos documents `cost` / `price` as Rupiah (for example WhatsApp Indonesia = 250).
 * Some live price payloads may expose the same value in thousands of Rupiah
 * (for example 0.25 instead of 250). Values below Rp100 are therefore treated
 * as the normalized-thousands form. Nokos public pricing currently starts at
 * about Rp100, so this prevents a 0.25/0.15 cost from collapsing to Rp501 after
 * the store markup is applied.
 */
function nokosPriceRupiah(value: unknown) {
  const parsed = num(value, 0);
  if (parsed <= 0) return 0;
  if (parsed < 100) return Math.max(1, Math.round(parsed * 1000));
  return Math.round(parsed);
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

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options?.method || "GET",
      headers,
      body,
      cache: "no-store",
    });
  } catch (cause) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause || "network error");
    throw new NokosProviderError(
      `Nokos ${action} gagal terhubung ke provider: ${causeMessage}`,
      { action, status: null, ambiguous: action === "getNumber" },
    );
  }

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NokosProviderError(
      `Nokos ${action} mengembalikan respons non-JSON (HTTP ${response.status}).`,
      {
        action,
        status: response.status,
        ambiguous: action === "getNumber",
      },
    );
  }

  const payload =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as NokosApiEnvelope<T>)
      : null;

  if (!response.ok || payload?.success === false || payload?.error) {
    const reason = sanitizeError(
      String(payload?.error || payload?.message || `HTTP ${response.status}`),
    );
    throw new NokosProviderError(
      `Nokos ${action} gagal (HTTP ${response.status}): ${reason}`,
      { action, status: response.status },
    );
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
    throw new NokosProviderError(
      `Nokos ${action} mengembalikan JSON tanpa data (HTTP ${response.status}; keys: ${
        keys.join(",") || "none"
      }).`,
      {
        action,
        status: response.status,
        ambiguous: action === "getNumber",
      },
    );
  }

  throw new NokosProviderError(
    `Nokos ${action} mengembalikan format respons yang tidak dikenali.`,
    { action, status: null, ambiguous: action === "getNumber" },
  );
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

async function getPriceMap(
  country: number,
  server: "s1" | "s2",
  options?: { force?: boolean },
): Promise<Record<string, NokosPriceEntry>> {
  const cacheKey = `${country}:${server}`;
  const cached = options?.force ? null : priceCache.get(cacheKey);
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

type NokosServerMode = "auto" | "s1" | "s2";
type NokosConcreteServer = "s1" | "s2";

type NokosServerPriceChoice = {
  server: NokosConcreteServer;
  providerPrice: number;
  stock: number;
};

function chooseBestServerPrice(
  s1Entry?: NokosPriceEntry,
  s2Entry?: NokosPriceEntry,
): NokosServerPriceChoice | null {
  const candidates: NokosServerPriceChoice[] = [];

  const add = (server: NokosConcreteServer, entry?: NokosPriceEntry) => {
    const providerPrice = nokosPriceRupiah(entry?.cost);
    const stock = Math.max(0, int(entry?.count));
    if (providerPrice <= 0 || stock <= 0) return;
    candidates.push({ server, providerPrice, stock });
  };

  add("s1", s1Entry);
  add("s2", s2Entry);

  candidates.sort(
    (a, b) =>
      a.providerPrice - b.providerPrice ||
      b.stock - a.stock ||
      (a.server === "s2" ? -1 : 1),
  );

  return candidates[0] || null;
}

function sellingPrice(providerPrice: number) {
  const percent = Math.max(0, num(process.env.NOKOS_MARKUP_PERCENT, 0));
  const flat = Math.max(0, num(process.env.NOKOS_MARKUP_FLAT, 0));
  return Math.max(1, Math.ceil(providerPrice * (1 + percent / 100) + flat));
}

export async function getNokosPriceCheck(options: {
  service: string;
  country?: number;
  server?: NokosServerMode;
}) {
  const { services, countries } = await getNokosReference();
  const query = String(options.service || "").trim().toLowerCase();
  if (!query) throw new Error("Parameter service wajib diisi.");

  const service =
    services.find((item) => item.code.toLowerCase() === query) ||
    services.find((item) => item.name.toLowerCase() === query) ||
    services.find((item) => item.name.toLowerCase().includes(query));
  if (!service) throw new Error(`Layanan Nokos "${options.service}" tidak ditemukan.`);

  const defaultCountry = countries.find((item) => item.id === 6) || countries[0];
  if (!defaultCountry) throw new Error("Daftar negara Nokos belum tersedia.");

  const requestedCountry = int(options.country, defaultCountry.id);
  const country = countries.find((item) => item.id === requestedCountry) || defaultCountry;
  const requestedServer: NokosServerMode =
    options.server === "s1" ? "s1" : options.server === "s2" ? "s2" : "auto";

  const [s1Map, s2Map] = await Promise.all([
    requestedServer === "s2"
      ? Promise.resolve({} as Record<string, NokosPriceEntry>)
      : getPriceMap(country.id, "s1"),
    requestedServer === "s1"
      ? Promise.resolve({} as Record<string, NokosPriceEntry>)
      : getPriceMap(country.id, "s2"),
  ]);

  const best = chooseBestServerPrice(
    requestedServer === "s2" ? undefined : s1Map[service.code],
    requestedServer === "s1" ? undefined : s2Map[service.code],
  );

  const server: NokosConcreteServer =
    best?.server || (requestedServer === "s1" ? "s1" : "s2");
  const selectedEntry = server === "s1" ? s1Map[service.code] : s2Map[service.code];

  let availability: { available?: string | number; price?: string | number } = {};
  try {
    availability = await nokosRequest<{
      available?: string | number;
      price?: string | number;
    }>("getAvailability", {
      query: { service: service.code, country: country.id, server },
    });
  } catch {
    // getPrices tetap sumber utama; availability hanya diagnostik/fallback.
  }

  const rawCatalogCost = num(selectedEntry?.cost, 0);
  const rawAvailabilityPrice = num(availability.price, 0);
  const catalogProviderPrice = best?.providerPrice || nokosPriceRupiah(selectedEntry?.cost);
  const checkoutProviderPrice = nokosPriceRupiah(availability.price);
  const providerPrice = catalogProviderPrice || checkoutProviderPrice;
  const stockCatalog = best?.stock || Math.max(0, int(selectedEntry?.count));
  const stockAvailability = Math.max(0, int(availability.available));

  if (providerPrice <= 0) {
    throw new Error(`Harga provider untuk ${service.name} - ${country.name} belum tersedia.`);
  }

  const markupPercent = Math.max(0, num(process.env.NOKOS_MARKUP_PERCENT, 0));
  const markupFlat = Math.max(0, num(process.env.NOKOS_MARKUP_FLAT, 0));
  const selling = sellingPrice(providerPrice);

  return {
    service: { code: service.code, name: service.name },
    country: { id: country.id, name: country.name, prefix: country.prefix || "" },
    requestedServer,
    server,
    source: {
      getPrices: {
        rawCost: rawCatalogCost,
        normalizedPrice: catalogProviderPrice,
        stock: stockCatalog,
      },
      getAvailability: {
        rawPrice: rawAvailabilityPrice,
        normalizedPrice: checkoutProviderPrice,
        stock: stockAvailability,
      },
    },
    effectiveSource:
      catalogProviderPrice > 0 && stockCatalog > 0 ? "getPrices" : "getAvailability",
    availabilityHealthy: checkoutProviderPrice > 0 && stockAvailability > 0,
    safeToSell: providerPrice > 0 && (stockCatalog > 0 || stockAvailability > 0),
    consistent: {
      price:
        checkoutProviderPrice > 0
          ? catalogProviderPrice > 0 && catalogProviderPrice === checkoutProviderPrice
          : null,
      stock:
        stockAvailability > 0
          ? stockCatalog > 0 && stockCatalog === stockAvailability
          : null,
    },
    providerPrice,
    markupPercent,
    markupFlat,
    percentageMarkupAmount: Math.ceil(providerPrice * (markupPercent / 100)),
    profit: Math.max(0, selling - providerPrice),
    sellingPrice: selling,
  };
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

type NokosCatalogSort = "popular" | "price" | "stock" | "name";
type NokosCheapestSort = "price" | "stock" | "name";
type NokosRegion = "all" | "southeast-asia" | "europe" | "americas" | "africa";

const POPULAR_SERVICE_TERMS = [
  "whatsapp",
  "telegram",
  "google",
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "discord",
  "tinder",
  "netflix",
  "amazon",
];

const SOUTHEAST_ASIA = new Set([
  "indonesia",
  "malaysia",
  "singapore",
  "thailand",
  "vietnam",
  "philippines",
  "brunei",
  "cambodia",
  "laos",
  "myanmar",
  "timor-leste",
  "east timor",
]);

const EUROPE = new Set([
  "albania","andorra","austria","belarus","belgium","bosnia and herzegovina","bulgaria","croatia","cyprus",
  "czech republic","czechia","denmark","estonia","finland","france","germany","greece","hungary","iceland",
  "ireland","italy","kosovo","latvia","liechtenstein","lithuania","luxembourg","malta","moldova","monaco",
  "montenegro","netherlands","north macedonia","norway","poland","portugal","romania","russia","san marino",
  "serbia","slovakia","slovenia","spain","sweden","switzerland","ukraine","united kingdom","great britain",
  "vatican","faroe islands","gibraltar","isle of man",
]);

const AMERICAS = new Set([
  "argentina","bahamas","barbados","belize","bolivia","brazil","canada","chile","colombia","costa rica",
  "cuba","dominica","dominican republic","ecuador","el salvador","grenada","guatemala","guyana","haiti",
  "honduras","jamaica","mexico","nicaragua","panama","paraguay","peru","saint kitts and nevis",
  "saint lucia","saint vincent and the grenadines","suriname","trinidad and tobago","uruguay","usa",
  "united states","united states of america","venezuela","puerto rico","greenland","bermuda","aruba",
  "curacao","cayman islands","virgin islands",
]);

const AFRICA = new Set([
  "algeria","angola","benin","botswana","burkina faso","burundi","cameroon","cape verde","central african republic",
  "chad","comoros","congo","democratic republic of the congo","djibouti","egypt","equatorial guinea","eritrea",
  "eswatini","ethiopia","gabon","gambia","ghana","guinea","guinea-bissau","ivory coast","cote d'ivoire","kenya",
  "lesotho","liberia","libya","madagascar","malawi","mali","mauritania","mauritius","morocco","mozambique",
  "namibia","niger","nigeria","rwanda","sao tome and principe","senegal","seychelles","sierra leone","somalia",
  "south africa","south sudan","sudan","tanzania","togo","tunisia","uganda","zambia","zimbabwe",
]);

function normalizedCountryName(name: string) {
  return String(name || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countryMatchesRegion(country: NokosCountry, region: NokosRegion) {
  if (region === "all") return true;
  const name = normalizedCountryName(country.name);
  if (region === "southeast-asia") return SOUTHEAST_ASIA.has(name);
  if (region === "europe") return EUROPE.has(name);
  if (region === "americas") return AMERICAS.has(name);
  if (region === "africa") return AFRICA.has(name);
  return true;
}

function servicePopularity(service: NokosService) {
  const haystack = `${service.name} ${service.code}`.toLowerCase();
  const index = POPULAR_SERVICE_TERMS.findIndex((term) => haystack.includes(term));
  return index === -1 ? 10_000 : index;
}

function sortCatalogRows(rows: Array<{ product: Product; service: NokosService }>, sort: NokosCatalogSort) {
  if (sort === "price") {
    rows.sort((a, b) => a.product.price - b.product.price || b.product.stock - a.product.stock);
    return;
  }
  if (sort === "stock") {
    rows.sort((a, b) => b.product.stock - a.product.stock || a.product.price - b.product.price);
    return;
  }
  if (sort === "name") {
    rows.sort((a, b) => a.product.name.localeCompare(b.product.name, "id-ID"));
    return;
  }
  rows.sort(
    (a, b) =>
      servicePopularity(a.service) - servicePopularity(b.service) ||
      b.product.stock - a.product.stock ||
      a.product.price - b.product.price,
  );
}

async function getServicePriceMap(
  service: string,
  server: "s1" | "s2",
): Promise<Record<number, NokosPriceEntry>> {
  const cacheKey = `service:${service}:${server}`;
  const cached = servicePriceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await nokosRequest<Record<string, unknown>>("getPrices", {
    query: { service, server },
  });

  const result: Record<number, NokosPriceEntry> = {};
  for (const [countryKey, rawCountry] of Object.entries(data || {})) {
    const countryId = int(countryKey, Number.NaN);
    if (!Number.isFinite(countryId) || !rawCountry || typeof rawCountry !== "object") continue;
    const countryRecord = rawCountry as Record<string, unknown>;

    let entry: unknown = countryRecord[service];
    if (!entry && ("cost" in countryRecord || "count" in countryRecord)) {
      entry = countryRecord;
    }
    if (!entry || typeof entry !== "object") continue;

    const priceEntry = entry as NokosPriceEntry;
    const cost = nokosPriceRupiah(priceEntry.cost);
    const count = Math.max(0, int(priceEntry.count));
    if (cost > 0 || count > 0) result[countryId] = { cost, count };
  }

  servicePriceCache.set(cacheKey, { expiresAt: Date.now() + 30_000, data: result });
  return result;
}

export async function getNokosCatalog(options?: {
  country?: number;
  server?: NokosServerMode;
  search?: string;
  sort?: NokosCatalogSort;
  minStock?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}) {
  const { services, countries } = await getNokosReference();
  const defaultCountry = countries.find((item) => item.id === 6) || countries[0];
  if (!defaultCountry) throw new Error("Daftar negara belum tersedia.");

  const requestedCountry = int(options?.country, defaultCountry.id);
  const country = countries.find((item) => item.id === requestedCountry) || defaultCountry;
  const server: NokosServerMode =
    options?.server === "s1" ? "s1" : options?.server === "s2" ? "s2" : "auto";

  const [s1Map, s2Map] = await Promise.all([
    server === "s2"
      ? Promise.resolve({} as Record<string, NokosPriceEntry>)
      : getPriceMap(country.id, "s1"),
    server === "s1"
      ? Promise.resolve({} as Record<string, NokosPriceEntry>)
      : getPriceMap(country.id, "s2"),
  ]);

  const search = String(options?.search || "").trim().toLowerCase();
  const minStock = Math.max(0, int(options?.minStock, 0));
  const maxPrice = Math.max(0, int(options?.maxPrice, 0));
  const sort: NokosCatalogSort =
    options?.sort === "price" || options?.sort === "stock" || options?.sort === "name"
      ? options.sort
      : "popular";

  const rows: Array<{ product: Product; service: NokosService }> = [];
  for (const service of services) {
    if (search && !`${service.name} ${service.code}`.toLowerCase().includes(search)) continue;

    const best = chooseBestServerPrice(
      server === "s2" ? undefined : s1Map[service.code],
      server === "s1" ? undefined : s2Map[service.code],
    );
    if (!best) continue;

    const product = choiceToProduct({
      service,
      country,
      server: best.server,
      providerPrice: best.providerPrice,
      stock: best.stock,
    });

    if (minStock > 0 && best.stock < minStock) continue;
    if (maxPrice > 0 && product.price > maxPrice) continue;
    rows.push({ product, service });
  }

  sortCatalogRows(rows, sort);

  const page = Math.max(1, int(options?.page, 1));
  const limit = Math.min(60, Math.max(12, int(options?.limit, 24)));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;

  return {
    products: rows.slice(start, start + limit).map((item) => item.product),
    countries,
    country,
    server,
    total,
    page: currentPage,
    totalPages,
  };
}

export async function getNokosCheapestCatalog(options: {
  service: string;
  server?: NokosServerMode;
  sort?: NokosCheapestSort;
  region?: NokosRegion;
  minStock?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}) {
  const { services, countries } = await getNokosReference();
  const serviceCode = String(options.service || "").trim();
  const service = services.find((item) => item.code === serviceCode);
  if (!service) throw new Error("Layanan yang dipilih tidak ditemukan.");

  const server: NokosServerMode =
    options.server === "s1" ? "s1" : options.server === "s2" ? "s2" : "auto";

  const [s1Map, s2Map] = await Promise.all([
    server === "s2"
      ? Promise.resolve({} as Record<number, NokosPriceEntry>)
      : getServicePriceMap(service.code, "s1"),
    server === "s1"
      ? Promise.resolve({} as Record<number, NokosPriceEntry>)
      : getServicePriceMap(service.code, "s2"),
  ]);

  const minStock = Math.max(0, int(options.minStock, 0));
  const maxPrice = Math.max(0, int(options.maxPrice, 0));
  const region: NokosRegion =
    options.region === "southeast-asia" ||
    options.region === "europe" ||
    options.region === "americas" ||
    options.region === "africa"
      ? options.region
      : "all";
  const sort: NokosCheapestSort =
    options.sort === "stock" || options.sort === "name" ? options.sort : "price";

  const rows: Product[] = [];
  for (const country of countries) {
    if (!countryMatchesRegion(country, region)) continue;

    const best = chooseBestServerPrice(
      server === "s2" ? undefined : s1Map[country.id],
      server === "s1" ? undefined : s2Map[country.id],
    );
    if (!best) continue;

    const product = choiceToProduct({
      service,
      country,
      server: best.server,
      providerPrice: best.providerPrice,
      stock: best.stock,
    });
    if (minStock > 0 && best.stock < minStock) continue;
    if (maxPrice > 0 && product.price > maxPrice) continue;
    rows.push(product);
  }

  if (sort === "stock") {
    rows.sort((a, b) => b.stock - a.stock || a.price - b.price);
  } else if (sort === "name") {
    rows.sort((a, b) =>
      (a.nokosCountryName || a.name).localeCompare(
        b.nokosCountryName || b.name,
        "id-ID",
      ),
    );
  } else {
    rows.sort((a, b) => a.price - b.price || b.stock - a.stock);
  }

  const page = Math.max(1, int(options.page, 1));
  const limit = Math.min(60, Math.max(12, int(options.limit, 24)));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;

  return {
    products: rows.slice(start, start + limit),
    countries,
    service,
    server,
    total,
    page: currentPage,
    totalPages,
  };
}

export async function getNokosProduct(
  productId: string,
  options?: { force?: boolean },
): Promise<Product | null> {
  const parsed = parseNokosProductId(productId);
  if (!parsed) return null;
  const { services, countries } = await getNokosReference();
  const service = services.find((item) => item.code === parsed.service);
  const country = countries.find((item) => item.id === parsed.country);
  if (!service || !country) return null;

  // getPrices adalah sumber harga/stok utama yang dipakai katalog dan terbukti
  // mengembalikan data live pada production QEVANORA. getAvailability tetap
  // dicoba sebagai fallback karena endpoint itu kadang mengembalikan 0/0.
  const priceMap = await getPriceMap(parsed.country, parsed.server, {
    force: options?.force,
  });
  const priceEntry = priceMap[parsed.service];
  let providerPrice = nokosPriceRupiah(priceEntry?.cost);
  let stock = Math.max(0, int(priceEntry?.count));

  if (providerPrice <= 0 || stock <= 0) {
    try {
      const availability = await nokosRequest<{ available?: string | number; price?: string | number }>("getAvailability", {
        query: { service: parsed.service, country: parsed.country, server: parsed.server },
      });
      const fallbackPrice = nokosPriceRupiah(availability.price);
      const fallbackStock = Math.max(0, int(availability.available));
      if (fallbackPrice > 0) providerPrice = fallbackPrice;
      if (fallbackStock > 0) stock = fallbackStock;
    } catch {
      // getPrices tetap menjadi sumber utama; kegagalan fallback tidak membatalkan checkout.
    }
  }

  if (providerPrice <= 0 || stock <= 0) return null;
  return choiceToProduct({ service, country, server: parsed.server, providerPrice, stock });
}

export async function createNokosActivation(input: {
  service: string;
  country: number;
  server: "s1" | "s2";
  operator?: string;
  idempotencyKey: string;
}) {
  const data = await nokosRequest<NokosActivation>("getNumber", {
    method: "POST",
    body: {
      service: input.service,
      country: input.country,
      server: input.server,
      ...(input.operator && input.operator !== "any" ? { operator: input.operator } : {}),
    },
    idempotencyKey: input.idempotencyKey,
  });

  const activationId = String(data.activation_id || "").trim();
  const phone = String(data.phone || "").trim();
  if (!activationId || !phone) {
    throw new NokosProviderError(
      "Nokos getNumber merespons tetapi activation_id/phone tidak valid.",
      { action: "getNumber", status: 200, ambiguous: true },
    );
  }

  // Samakan unit harga pada response getNumber dengan katalog (Rupiah).
  // Contoh payload live 0.24 harus dicatat sebagai Rp240, bukan dibulatkan Rp0.
  const activationPrice = nokosPriceRupiah(data.price);
  return {
    ...data,
    activation_id: activationId,
    phone,
    ...(activationPrice > 0 ? { price: activationPrice } : {}),
  };
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
