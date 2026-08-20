import "server-only";
import {
  getSmscodeCountries,
  getSmscodeQuote,
  getSmscodeServices,
} from "@/lib/smscode";

export type SmscodeProviderOrder = {
  id: number;
  status: string;
  product_id?: number | null;
  catalog_product_id?: number | null;
  amount?: number | string | null;
  phone_number?: string | null;
  otp_code?: string | null;
  otp_received_at?: string | null;
  expires_at?: string | null;
  failed_reason?: string | null;
  operator_id?: number | null;
  operator_name?: string | null;
  can_cancel?: boolean | null;
  can_resend?: boolean | null;
  resend_available_at?: string | null;
  [key: string]: unknown;
};

type SmscodeEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: unknown } | string | null;
  message?: string;
};

export class SmscodeOrderApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, options?: { code?: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "SmscodeOrderApiError";
    this.code = String(options?.code || "SMSCODE_ERROR");
    this.status = Number(options?.status || 0);
    this.details = options?.details;
  }
}

function int(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function baseUrl() {
  return String(process.env.SMSCODE_API_BASE || "https://api.smscode.gg/v1")
    .trim()
    .replace(/\/+$/, "");
}

function token() {
  const value = String(process.env.SMSCODE_API_TOKEN || "").trim();
  if (!value) throw new SmscodeOrderApiError("SMSCode belum dikonfigurasi.", { code: "NOT_CONFIGURED" });
  return value;
}

function timeoutMs() {
  return Math.min(30_000, Math.max(5_000, int(process.env.SMSCODE_API_TIMEOUT_MS, 15_000)));
}

export function isSmscodeCheckoutEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.SMSCODE_CHECKOUT_ENABLED || "").trim());
}

async function request<T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token()}`,
    };
    let body: string | undefined;
    if (options?.method === "POST") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body || {});
    }
    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey.slice(0, 100);
    }

    const response = await fetch(`${baseUrl()}${path}`, {
      method: options?.method || "GET",
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    let payload: SmscodeEnvelope<T> | null = null;
    try {
      payload = (await response.json()) as SmscodeEnvelope<T>;
    } catch {
      throw new SmscodeOrderApiError(`SMSCode mengembalikan respons non-JSON (HTTP ${response.status}).`, {
        code: response.ok ? "INVALID_RESPONSE" : "HTTP_ERROR",
        status: response.status,
      });
    }

    if (!response.ok || payload?.success === false || payload?.error) {
      const raw = payload?.error;
      const code = raw && typeof raw === "object" ? String(raw.code || "") : "";
      const message = raw && typeof raw === "object"
        ? String(raw.message || payload?.message || `HTTP ${response.status}`)
        : String(raw || payload?.message || `HTTP ${response.status}`);
      const details = raw && typeof raw === "object" ? raw.details : undefined;
      throw new SmscodeOrderApiError(`SMSCode: ${message}`, {
        code: code || `HTTP_${response.status}`,
        status: response.status,
        details,
      });
    }

    if (!payload || payload.data === undefined) {
      throw new SmscodeOrderApiError("SMSCode mengembalikan respons tanpa data.", {
        code: "INVALID_RESPONSE",
        status: response.status,
      });
    }
    return payload.data;
  } catch (error) {
    if (error instanceof SmscodeOrderApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SmscodeOrderApiError("SMSCode tidak merespons tepat waktu.", {
        code: "TIMEOUT",
        status: 0,
      });
    }
    throw new SmscodeOrderApiError(
      error instanceof Error ? error.message : "Koneksi ke SMSCode gagal.",
      { code: "NETWORK_ERROR", status: 0 },
    );
  } finally {
    clearTimeout(timer);
  }
}

export function isAmbiguousSmscodeOrderError(error: unknown) {
  if (!(error instanceof SmscodeOrderApiError)) return true;
  return (
    error.status >= 500 ||
    ["TIMEOUT", "NETWORK_ERROR", "REQUEST_IN_PROGRESS", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE"].includes(error.code)
  );
}

export function smscodeOrderErrorCode(error: unknown) {
  return error instanceof SmscodeOrderApiError ? error.code : "UNKNOWN";
}

export async function resolveSmscodeCheckoutProduct(input: {
  catalogProductId: number;
  countryId: number;
  platformId: number;
}) {
  const catalogProductId = int(input.catalogProductId);
  const countryId = int(input.countryId);
  const platformId = int(input.platformId);
  if (catalogProductId <= 0 || countryId <= 0 || platformId <= 0) {
    throw new Error("Layanan SMSCode tidak valid.");
  }

  const [countries, services, quote] = await Promise.all([
    getSmscodeCountries(),
    getSmscodeServices(countryId),
    getSmscodeQuote({ countryId, platformId, catalogProductId }),
  ]);
  const country = countries.find((item) => item.id === countryId);
  const service = services.find((item) => item.id === platformId);
  if (!country || !service) throw new Error("Referensi layanan SMSCode tidak ditemukan.");

  return {
    id: `smscode:${catalogProductId}`,
    catalogProductId,
    countryId,
    platformId,
    serviceCode: String(service.code || ""),
    serviceName: String(service.name || "OTP"),
    countryCode: String(country.code || ""),
    countryName: String(country.name || ""),
    countryEmoji: String(country.emoji || "🌐"),
    dialCode: String(country.dial_code || ""),
    providerPrice: quote.providerPrice,
    sellingPrice: quote.sellingPrice,
    stock: quote.stock,
    offerId: quote.offerId,
  };
}

export async function createSmscodeProviderOrder(input: {
  catalogProductId: number;
  maxPrice: number;
  idempotencyKey: string;
}) {
  const data = await request<{ orders?: SmscodeProviderOrder[]; failed_count?: number }>("/orders/create", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      catalog_product_id: int(input.catalogProductId),
      quantity: 1,
      policy: "cheapest",
      max_price: Math.max(1, int(input.maxPrice)),
    },
  });
  const order = Array.isArray(data.orders) ? data.orders[0] : undefined;
  if (!order?.id) {
    throw new SmscodeOrderApiError("SMSCode tidak mengembalikan order yang valid.", {
      code: "INVALID_ORDER_RESPONSE",
      status: 502,
    });
  }
  return order;
}

export async function getSmscodeProviderOrder(id: string | number) {
  return request<SmscodeProviderOrder>(`/orders/${encodeURIComponent(String(id))}`);
}

export async function cancelSmscodeProviderOrder(id: string | number) {
  return request<{ order_id?: number; status?: string; refund_amount?: number; new_balance?: number }>(
    "/orders/cancel",
    { method: "POST", body: { id: int(id) } },
  );
}

export async function finishSmscodeProviderOrder(id: string | number) {
  return request<{ order_id?: number; status?: string }>("/orders/finish", {
    method: "POST",
    body: { id: int(id) },
  });
}

export async function resendSmscodeProviderOrder(id: string | number) {
  return request<{ order_id?: number; status?: string; resent?: boolean }>("/orders/resend", {
    method: "POST",
    body: { id: int(id) },
  });
}
