import "server-only";
import type { Product } from "@/types/catalog";

export type FollowService = {
  service: string | number;
  name: string;
  type?: string;
  category?: string;
  rate: string | number;
  min: string | number;
  max: string | number;
  refill?: boolean | string | number;
  cancel?: boolean | string | number;
};

export type FollowStatusResponse = {
  charge?: string | number;
  start_count?: string | number;
  status?: string;
  remains?: string | number;
  currency?: string;
  error?: string;
  [key: string]: unknown;
};

type FollowBalanceResponse = {
  balance?: string | number;
  currency?: string;
  error?: string;
  [key: string]: unknown;
};

type FollowAddResponse = {
  order?: string | number;
  error?: string;
  [key: string]: unknown;
};

type FollowRateCurrency = "IDR" | "USD";
type FollowCurrencySource = "env" | "provider";

type CachedServices = {
  expiresAt: number;
  services: FollowService[];
  currency: FollowRateCurrency;
  currencySource: FollowCurrencySource;
};

let servicesCache: CachedServices | null = null;

function baseUrl() {
  return String(process.env.FOLLOW_API_URL || "https://follow.co.id/api/v2").trim();
}

function apiKey() {
  const key = String(process.env.FOLLOW_API_KEY || "").trim();
  if (!key) throw new Error("FOLLOW_API_KEY belum diatur di Vercel.");
  return key;
}

function positiveInt(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolish(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

async function followRequest<T>(params: Record<string, string | number>): Promise<T> {
  const url = new URL(baseUrl());
  for (const [key, value] of Object.entries({ ...params, key: apiKey() })) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Follow.co.id mengembalikan respons tidak valid (${response.status}).`);
  }

  if (payload && typeof payload === "object" && "error" in payload) {
    const error = String((payload as { error?: unknown }).error || "").trim();
    if (error) throw new Error(`Follow.co.id: ${error}`);
  }

  if (!response.ok) {
    const detail = raw.trim().slice(0, 300);
    throw new Error(
      detail
        ? `Follow.co.id HTTP ${response.status}: ${detail}`
        : `Follow.co.id HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

export function isFollowConfigured() {
  return Boolean(String(process.env.FOLLOW_API_KEY || "").trim());
}

export async function getFollowBalance(): Promise<FollowBalanceResponse> {
  return followRequest<FollowBalanceResponse>({ action: "balance" });
}

function normalizeRateCurrency(value: unknown): FollowRateCurrency | null {
  const currency = String(value || "").trim().toUpperCase();
  if (currency === "IDR" || currency === "USD") return currency;
  return null;
}

function configuredRateCurrency(): FollowRateCurrency | null {
  const configured = String(process.env.FOLLOW_RATE_CURRENCY || "AUTO")
    .trim()
    .toUpperCase();

  if (!configured || configured === "AUTO") return null;

  const currency = normalizeRateCurrency(configured);
  if (!currency) {
    throw new Error(
      "FOLLOW_RATE_CURRENCY tidak valid. Gunakan AUTO, IDR, atau USD.",
    );
  }
  return currency;
}

async function resolveRateCurrency(): Promise<{
  currency: FollowRateCurrency;
  source: FollowCurrencySource;
}> {
  const configured = configuredRateCurrency();
  if (configured) return { currency: configured, source: "env" };

  const balance = await getFollowBalance();
  const detected = normalizeRateCurrency(balance.currency);
  if (!detected) {
    throw new Error(
      "Mata uang rate Follow.co.id tidak bisa dideteksi otomatis. Atur FOLLOW_RATE_CURRENCY=IDR atau FOLLOW_RATE_CURRENCY=USD di Vercel sebelum menerima order.",
    );
  }

  return { currency: detected, source: "provider" };
}

function isSupportedQuantityService(service: FollowService) {
  const min = positiveInt(service.min);
  const max = positiveInt(service.max);
  if (!min || !max || max < min) return false;

  const type = String(service.type || "").toLowerCase();
  const blocked = [
    "custom comment",
    "custom comments",
    "mentions",
    "poll",
    "package",
    "comment likes",
  ];
  return !blocked.some((token) => type.includes(token));
}

export async function getFollowServices(options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && servicesCache && servicesCache.expiresAt > now) {
    return servicesCache;
  }

  const [servicesPayload, rateCurrency] = await Promise.all([
    followRequest<FollowService[]>({ action: "services" }),
    resolveRateCurrency(),
  ]);

  if (!Array.isArray(servicesPayload)) {
    throw new Error("Daftar layanan Follow.co.id tidak valid.");
  }

  servicesCache = {
    expiresAt: now + 5 * 60 * 1000,
    services: servicesPayload.filter(isSupportedQuantityService),
    currency: rateCurrency.currency,
    currencySource: rateCurrency.source,
  };

  return servicesCache;
}

export function getFollowPricingConfig() {
  const configuredPercent = numeric(process.env.FOLLOW_MARKUP_PERCENT, 20);
  const configuredFlat = numeric(process.env.FOLLOW_MARKUP_FLAT, 500);

  return {
    markupPercent: configuredPercent > 0 ? configuredPercent : 20,
    markupFlatPer1000: configuredFlat > 0 ? configuredFlat : 500,
    usdIdrRate: Math.max(1, numeric(process.env.FOLLOW_USD_IDR_RATE, 17000)),
  };
}

function sellingRateIdr(providerRate: number, currency: string) {
  const { markupPercent, markupFlatPer1000, usdIdrRate } =
    getFollowPricingConfig();
  const baseIdr =
    currency === "USD" ? providerRate * usdIdrRate : providerRate;

  return Math.max(
    1,
    Math.ceil(baseIdr * (1 + markupPercent / 100) + markupFlatPer1000),
  );
}

export function followServiceToProduct(service: FollowService, currency: string): Product {
  const serviceId = String(service.service);
  const min = positiveInt(service.min, 1);
  const max = Math.max(min, positiveInt(service.max, min));
  const rate = Math.max(0, numeric(service.rate));
  const sellRate = sellingRateIdr(rate, currency);
  const category = String(service.category || "Followers Sosmed").trim();
  const serviceName = String(service.name || `Layanan ${serviceId}`).trim();

  return {
    id: `follow-${serviceId}`,
    category: "followers-sosmed",
    categoryName: "Followers Sosmed",
    name: serviceName,
    shortDescription: `${category}\nMin ${min.toLocaleString("id-ID")} • Max ${max.toLocaleString("id-ID")} • ${String(service.type || "Standard")}`,
    fullDescription: `${serviceName}\n\nKategori provider: ${category}\nTipe: ${String(service.type || "Standard")}\nMinimum order: ${min.toLocaleString("id-ID")}\nMaksimum order: ${max.toLocaleString("id-ID")}\nRefill: ${boolish(service.refill) ? "Ya" : "Tidak"}\nCancel provider: ${boolish(service.cancel) ? "Ya" : "Tidak"}\n\nHarga dihitung berdasarkan jumlah yang kamu pesan.`,
    description: `${category} • Min ${min.toLocaleString("id-ID")} • Max ${max.toLocaleString("id-ID")}`,
    price: sellRate,
    stock: max,
    active: true,
    image: "/images/products/product-placeholder.svg",
    supplier: "follow",
    supplierProductId: serviceId,
    serviceType: String(service.type || ""),
    providerCategory: category,
    minQuantity: min,
    maxQuantity: max,
    refill: boolish(service.refill),
    cancel: boolish(service.cancel),
    ratePer1000: sellRate,
    providerRate: rate,
    providerCurrency: currency,
  };
}

export async function getFollowProductsPage(options?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { services, currency, currencySource } = await getFollowServices();
  const search = String(options?.search || "").trim().toLowerCase();
  const page = Math.max(1, positiveInt(options?.page, 1));
  const limit = Math.min(60, Math.max(12, positiveInt(options?.limit, 24)));

  const filtered = search
    ? services.filter((service) =>
        `${service.name || ""} ${service.category || ""} ${service.type || ""}`
          .toLowerCase()
          .includes(search),
      )
    : services;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const products = filtered
    .slice(start, start + limit)
    .map((service) => followServiceToProduct(service, currency));

  return { products, total, page: currentPage, totalPages, currency, currencySource };
}

export async function getFollowProduct(productId: string): Promise<Product | null> {
  const serviceId = String(productId || "").replace(/^follow-/, "").trim();
  if (!serviceId) return null;
  const { services, currency } = await getFollowServices();
  const service = services.find((item) => String(item.service) === serviceId);
  return service ? followServiceToProduct(service, currency) : null;
}

export async function createFollowOrder(input: {
  service: string;
  link: string;
  quantity: number;
}) {
  const payload = await followRequest<FollowAddResponse>({
    action: "add",
    service: input.service,
    link: input.link,
    quantity: input.quantity,
  });

  const order = String(payload.order || "").trim();
  if (!order) throw new Error("Follow.co.id tidak mengembalikan Order ID.");
  return { ...payload, order };
}

export async function getFollowOrderStatus(orderId: string) {
  return followRequest<FollowStatusResponse>({ action: "status", order: orderId });
}
