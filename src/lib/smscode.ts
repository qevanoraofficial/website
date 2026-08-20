import "server-only";

export type SmscodeCountry = {
  id: number;
  code: string;
  name: string;
  dial_code?: string | null;
  emoji?: string | null;
  active?: boolean;
};

export type SmscodeService = {
  id: number;
  code: string;
  name: string;
  active?: boolean;
};

type SmscodeOffer = {
  id: number;
  name: string;
  country_id: number;
  platform_id: number;
  catalog_product_id: number;
  operator_id?: number | null;
  operator_name?: string | null;
  available: number;
  price: number;
  active: boolean;
};

type SmscodeMeta = {
  page?: number;
  limit?: number;
  count?: number;
};

type SmscodeApiError = {
  code?: string;
  message?: string;
  details?: unknown;
};

type SmscodeEnvelope<T> = {
  success?: boolean;
  data?: T;
  meta?: SmscodeMeta;
  error?: SmscodeApiError | string | null;
  message?: string;
};

export type SmscodeCatalogItem = {
  id: string;
  catalogProductId: number;
  platformId: number;
  serviceCode: string;
  serviceName: string;
  countryId: number;
  countryCode: string;
  countryName: string;
  countryEmoji: string;
  dialCode: string;
  price: number;
  stock: number;
  active: boolean;
};

export type SmscodeQuote = {
  catalogProductId: number;
  platformId: number;
  countryId: number;
  providerPrice: number;
  sellingPrice: number;
  stock: number;
  offerId: number;
};

type CatalogSort = "popular" | "price" | "stock" | "name";

const POPULAR_SERVICE_TERMS = [
  "whatsapp",
  "telegram",
  "google",
  "instagram",
  "facebook",
  "tiktok",
  "discord",
  "tinder",
  "openai",
  "chatgpt",
  "netflix",
  "microsoft",
  "apple",
  "grab",
  "gojek",
  "ovo",
];

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function baseUrl() {
  return String(process.env.SMSCODE_API_BASE || "https://api.smscode.gg/v1")
    .trim()
    .replace(/\/+$/, "");
}

function apiToken() {
  const token = String(process.env.SMSCODE_API_TOKEN || "").trim();
  if (!token) throw new Error("SMSCODE_API_TOKEN belum diatur di environment server Cloudflare.");
  return token;
}

function timeoutMs() {
  return Math.min(
    30_000,
    Math.max(3_000, intValue(process.env.SMSCODE_API_TIMEOUT_MS, 15_000)),
  );
}

function maxCatalogPages() {
  return Math.min(
    10,
    Math.max(1, intValue(process.env.SMSCODE_CATALOG_MAX_PAGES, 10)),
  );
}

function sanitizeProviderError(code: string, message: string) {
  const normalized = `${code} ${message}`.toUpperCase();
  if (normalized.includes("UNAUTHORIZED") || normalized.includes("FORBIDDEN")) {
    return "Layanan SMSCode belum terautentikasi dengan benar.";
  }
  if (normalized.includes("RATE_LIMIT")) {
    return "Permintaan SMSCode terlalu cepat. Silakan coba lagi sebentar.";
  }
  if (normalized.includes("SERVICE_UNAVAILABLE")) {
    return "SMSCode sedang maintenance atau sementara tidak tersedia.";
  }
  return message.trim() || "SMSCode mengembalikan kesalahan yang tidak dikenali.";
}

async function smscodeRequest<T>(
  path: string,
  options?: {
    query?: Record<string, string | number | undefined>;
  },
): Promise<{ data: T; meta?: SmscodeMeta }> {
  const url = new URL(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options?.query || {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiToken()}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    let payload: SmscodeEnvelope<T> | null = null;
    try {
      payload = (await response.json()) as SmscodeEnvelope<T>;
    } catch {
      throw new Error(`SMSCode mengembalikan respons non-JSON (HTTP ${response.status}).`);
    }

    if (!response.ok || payload?.success === false || payload?.error) {
      const rawError = payload?.error;
      const code =
        rawError && typeof rawError === "object" ? String(rawError.code || "") : "";
      const message =
        rawError && typeof rawError === "object"
          ? String(rawError.message || payload?.message || "")
          : String(rawError || payload?.message || `HTTP ${response.status}`);
      throw new Error(`SMSCode: ${sanitizeProviderError(code, message)}`);
    }

    if (!payload || payload.data === undefined) {
      throw new Error("SMSCode mengembalikan respons tanpa data.");
    }

    return { data: payload.data, meta: payload.meta };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("SMSCode tidak merespons tepat waktu. Silakan coba lagi.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function roundUp(value: number, step: number) {
  if (step <= 1) return Math.ceil(value);
  return Math.ceil(value / step) * step;
}

export function smscodeSellingPrice(providerPrice: number) {
  const modal = Math.max(0, Math.round(providerPrice));
  if (modal <= 0) return 0;

  const percent = Math.max(0, numberValue(process.env.SMSCODE_MARKUP_PERCENT, 20));
  const flat = Math.max(0, intValue(process.env.SMSCODE_MARKUP_FLAT, 0));
  const minProfit = Math.max(0, intValue(process.env.SMSCODE_MIN_PROFIT, 800));
  const minSell = Math.max(0, intValue(process.env.SMSCODE_MIN_SELL_PRICE, 1000));
  const rounding = Math.min(
    10_000,
    Math.max(1, intValue(process.env.SMSCODE_PRICE_ROUNDING, 500)),
  );

  const percentProfit = Math.ceil(modal * (percent / 100));
  const profit = Math.max(flat, minProfit, percentProfit);
  return roundUp(Math.max(minSell, modal + profit), rounding);
}

export function isSmscodeConfigured() {
  return Boolean(String(process.env.SMSCODE_API_TOKEN || "").trim());
}

export async function getSmscodeCountries() {
  const { data } = await smscodeRequest<SmscodeCountry[]>("/catalog/countries");
  return (Array.isArray(data) ? data : [])
    .filter((country) => country && country.active !== false)
    .sort((a, b) => {
      if (String(a.code || "").toUpperCase() === "ID") return -1;
      if (String(b.code || "").toUpperCase() === "ID") return 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "id-ID");
    });
}

export async function getSmscodeServices(countryId: number) {
  const { data } = await smscodeRequest<SmscodeService[]>("/catalog/services", {
    query: { country_id: countryId },
  });
  return (Array.isArray(data) ? data : []).filter(
    (service) => service && service.active !== false,
  );
}

async function getSmscodeOffers(options: {
  countryId: number;
  platformId?: number;
}) {
  const limit = 1000;
  const offers: SmscodeOffer[] = [];

  for (let page = 1; page <= maxCatalogPages(); page += 1) {
    const { data, meta } = await smscodeRequest<SmscodeOffer[]>("/catalog/products", {
      query: {
        country_id: options.countryId,
        platform_id: options.platformId,
        sort: "price_asc",
        limit,
        page,
      },
    });

    const rows = Array.isArray(data) ? data : [];
    offers.push(...rows);

    const count = Math.max(0, intValue(meta?.count, rows.length));
    if (count < limit || rows.length < limit) break;
  }

  return offers.filter(
    (offer) =>
      offer &&
      offer.active !== false &&
      intValue(offer.available) > 0 &&
      intValue(offer.price) > 0 &&
      intValue(offer.catalog_product_id) > 0,
  );
}

function servicePopularity(service: SmscodeService) {
  const haystack = `${service.name} ${service.code}`.toLowerCase();
  const index = POPULAR_SERVICE_TERMS.findIndex((term) => haystack.includes(term));
  return index === -1 ? 10_000 : index;
}

function selectCountry(countries: SmscodeCountry[], value?: string) {
  const requested = String(value || "ID").trim();
  const requestedId = intValue(requested, Number.NaN);
  const upper = requested.toUpperCase();

  const match = countries.find(
    (country) =>
      country.id === requestedId || String(country.code || "").toUpperCase() === upper,
  );
  return (
    match ||
    countries.find((country) => String(country.code || "").toUpperCase() === "ID") ||
    countries[0]
  );
}

function groupCheapestOffers(
  offers: SmscodeOffer[],
  services: SmscodeService[],
  country: SmscodeCountry,
) {
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  const grouped = new Map<number, SmscodeOffer>();

  for (const offer of offers) {
    const catalogProductId = intValue(offer.catalog_product_id);
    const existing = grouped.get(catalogProductId);
    if (!existing) {
      grouped.set(catalogProductId, offer);
      continue;
    }

    const price = intValue(offer.price);
    const existingPrice = intValue(existing.price);
    if (
      price < existingPrice ||
      (price === existingPrice && intValue(offer.available) > intValue(existing.available))
    ) {
      grouped.set(catalogProductId, offer);
    }
  }

  return Array.from(grouped.values()).map((offer) => {
    const service = serviceMap.get(intValue(offer.platform_id)) || {
      id: intValue(offer.platform_id),
      code: String(offer.platform_id),
      name: String(offer.name || "OTP")
        .replace(/\s+-\s+.*$/, "")
        .replace(/\s*\(\$[^)]*\)\s*$/, "")
        .trim(),
    };

    const providerPrice = Math.max(0, intValue(offer.price));
    const item: SmscodeCatalogItem = {
      id: `smscode:${intValue(offer.catalog_product_id)}`,
      catalogProductId: intValue(offer.catalog_product_id),
      platformId: intValue(offer.platform_id),
      serviceCode: String(service.code || ""),
      serviceName: String(service.name || "OTP"),
      countryId: country.id,
      countryCode: String(country.code || ""),
      countryName: String(country.name || ""),
      countryEmoji: String(country.emoji || "🌐"),
      dialCode: String(country.dial_code || ""),
      price: smscodeSellingPrice(providerPrice),
      stock: Math.max(0, intValue(offer.available)),
      active: true,
    };

    return { item, service };
  });
}

export async function getSmscodeCatalog(options?: {
  country?: string;
  search?: string;
  sort?: CatalogSort;
  minStock?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}) {
  const countries = await getSmscodeCountries();
  const country = selectCountry(countries, options?.country);
  if (!country) throw new Error("Daftar negara SMSCode belum tersedia.");

  const [services, offers] = await Promise.all([
    getSmscodeServices(country.id),
    getSmscodeOffers({ countryId: country.id }),
  ]);

  const search = String(options?.search || "").trim().toLowerCase();
  const minStock = Math.max(0, intValue(options?.minStock));
  const maxPrice = Math.max(0, intValue(options?.maxPrice));
  const sort: CatalogSort =
    options?.sort === "price" || options?.sort === "stock" || options?.sort === "name"
      ? options.sort
      : "popular";

  const rows = groupCheapestOffers(offers, services, country).filter(({ item, service }) => {
    if (
      search &&
      !`${service.name} ${service.code} ${item.countryName}`.toLowerCase().includes(search)
    ) {
      return false;
    }
    if (minStock > 0 && item.stock < minStock) return false;
    if (maxPrice > 0 && item.price > maxPrice) return false;
    return true;
  });

  rows.sort((a, b) => {
    if (sort === "price") return a.item.price - b.item.price || b.item.stock - a.item.stock;
    if (sort === "stock") return b.item.stock - a.item.stock || a.item.price - b.item.price;
    if (sort === "name") {
      return a.item.serviceName.localeCompare(b.item.serviceName, "id-ID");
    }
    return (
      servicePopularity(a.service) - servicePopularity(b.service) ||
      a.item.price - b.item.price ||
      b.item.stock - a.item.stock
    );
  });

  const page = Math.max(1, intValue(options?.page, 1));
  const limit = Math.min(60, Math.max(12, intValue(options?.limit, 24)));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;

  return {
    country,
    countries,
    products: rows.slice(start, start + limit).map((row) => row.item),
    total,
    page: currentPage,
    totalPages,
    limit,
  };
}

export async function getSmscodeQuote(options: {
  countryId: number;
  platformId: number;
  catalogProductId: number;
}) {
  const offers = await getSmscodeOffers({
    countryId: options.countryId,
    platformId: options.platformId,
  });

  const matching = offers
    .filter((offer) => intValue(offer.catalog_product_id) === options.catalogProductId)
    .sort(
      (a, b) =>
        intValue(a.price) - intValue(b.price) ||
        intValue(b.available) - intValue(a.available),
    );
  const offer = matching[0];
  if (!offer) throw new Error("Offer SMSCode untuk layanan ini sedang tidak tersedia.");

  const providerPrice = Math.max(0, intValue(offer.price));
  const quote: SmscodeQuote = {
    catalogProductId: options.catalogProductId,
    platformId: options.platformId,
    countryId: options.countryId,
    providerPrice,
    sellingPrice: smscodeSellingPrice(providerPrice),
    stock: Math.max(0, intValue(offer.available)),
    offerId: intValue(offer.id),
  };
  return quote;
}

export async function checkSmscodeHealth() {
  const countries = await getSmscodeCountries();
  return {
    configured: true,
    reachable: true,
    countryCount: countries.length,
  };
}
