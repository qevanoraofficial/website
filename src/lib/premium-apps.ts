import "server-only";
import type { Product } from "@/types/catalog";

type JsonRecord = Record<string, unknown>;

type PremiumProviderProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  status: string;
};

export type PremiumProviderOrder = {
  id: string;
  status: string;
  credentials: string;
  raw: JsonRecord;
};

const DEFAULT_BASE_URL = "https://zakzznokos.my.id/api/app";
const DEFAULT_TIMEOUT_MS = 15_000;

function clean(value: unknown, maxLength = 6000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown, fallback = 0) {
  const parsed = Math.trunc(numberValue(value, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function firstText(record: JsonRecord, keys: string[]) {
  return clean(firstValue(record, keys));
}

function baseUrl() {
  return clean(process.env.ZAKZZ_APP_API_URL || DEFAULT_BASE_URL, 500).replace(/\/+$/, "");
}

function apiKey() {
  const key = clean(process.env.ZAKZZ_APP_API_KEY, 1000);
  if (!key) {
    throw new Error("Integrasi Premium Apps belum dikonfigurasi.");
  }
  return key;
}

function sellingPrice(providerPrice: number) {
  const percent = Math.max(0, numberValue(process.env.PREMIUM_APPS_MARKUP_PERCENT, 0));
  const flat = Math.max(0, numberValue(process.env.PREMIUM_APPS_MARKUP_FLAT, 0));
  return Math.max(1, Math.ceil(providerPrice * (1 + percent / 100) + flat));
}

function providerError(payload: unknown, status: number) {
  if (isRecord(payload)) {
    const nestedError = payload.error;
    if (typeof nestedError === "string" && nestedError.trim()) return nestedError.trim();
    if (isRecord(nestedError)) {
      const nestedMessage = firstText(nestedError, ["message", "error", "detail"]);
      if (nestedMessage) return nestedMessage;
    }
    const message = firstText(payload, ["message", "error_message", "detail"]);
    if (message) return message;
  }
  return `Zakzz Premium Apps gagal merespons (HTTP ${status}).`;
}

function unwrapPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return payload;

  const candidates = ["data", "result", "products", "product", "order", "history"];
  for (const key of candidates) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return payload;
}

async function premiumRequest(
  path: string,
  options?: { method?: "GET" | "POST"; body?: JsonRecord },
) {
  const controller = new AbortController();
  const timeoutMs = Math.max(
    3000,
    Math.min(30000, intValue(process.env.PREMIUM_APPS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)),
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const key = apiKey();
    const response = await fetch(`${baseUrl()}/${path.replace(/^\/+/, "")}`, {
      method: options?.method || "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
        "X-API-Key": key,
        ...(options?.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.method === "POST" ? JSON.stringify(options.body || {}) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`Zakzz Premium Apps mengembalikan respons non-JSON (HTTP ${response.status}).`);
    }

    if (!response.ok || (isRecord(payload) && payload.success === false)) {
      throw new Error(providerError(payload, response.status));
    }

    return unwrapPayload(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Zakzz Premium Apps sedang timeout. Silakan coba lagi.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function findArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["items", "products", "data", "result", "list", "rows"]) {
    if (Array.isArray(value[key])) return value[key] as unknown[];
  }
  return [];
}

function normalizeProviderProduct(value: unknown): PremiumProviderProduct | null {
  if (!isRecord(value)) return null;

  const id = firstText(value, ["id", "product_id", "productId", "code", "sku"]);
  const name = firstText(value, ["name", "product_name", "productName", "product", "title"]);
  const description = firstText(value, ["description", "desc", "detail", "note", "notes"]);
  const price = Math.max(
    0,
    Math.round(
      numberValue(
        firstValue(value, ["price", "selling_price", "sell_price", "reseller_price", "resellerPrice", "rate", "amount"]),
        0,
      ),
    ),
  );
  const stock = Math.max(
    0,
    intValue(firstValue(value, ["stock", "available", "qty", "quantity", "remaining"]), 0),
  );
  const status = firstText(value, ["status", "availability", "state"]).toUpperCase();

  if (!id || !name || price <= 0) return null;
  return { id, name, description, price, stock, status };
}

function isAvailable(product: PremiumProviderProduct) {
  if (product.stock <= 0) return false;
  return !/(UNAVAILABLE|INACTIVE|DISABLED|HABIS|SOLD[_ -]?OUT|OUT[_ -]?OF[_ -]?STOCK)/i.test(product.status);
}

function makeProductId(providerId: string) {
  return `premium-app:${encodeURIComponent(providerId)}`;
}

export function parsePremiumAppProductId(productId: string) {
  const match = /^premium-app:(.+)$/.exec(clean(productId, 500));
  if (!match) return null;
  try {
    const providerId = decodeURIComponent(match[1]);
    return providerId ? { providerId } : null;
  } catch {
    return null;
  }
}

function toCatalogProduct(provider: PremiumProviderProduct): Product {
  const price = sellingPrice(provider.price);
  const description = provider.description || `Akun ${provider.name} diproses otomatis melalui supplier Premium Apps.`;
  return {
    id: makeProductId(provider.id),
    category: "premium-apps",
    categoryName: "Premium Apps",
    name: provider.name,
    shortDescription: description,
    fullDescription: `${description}\n\nStok tersedia: ${provider.stock.toLocaleString("id-ID")}\nPengiriman data akun dilakukan otomatis setelah pembayaran berhasil.`,
    description,
    price,
    stock: provider.stock,
    active: isAvailable(provider),
    image: "/images/products/product-placeholder.svg",
    createdAt: "",
    updatedAt: "",
    supplier: "alfaprem",
    supplierProductId: provider.id,
    providerRate: provider.price,
    providerCurrency: "IDR",
  };
}

export async function getPremiumAppsCatalog(): Promise<Product[]> {
  const payload = await premiumRequest("products");
  return findArray(payload)
    .map(normalizeProviderProduct)
    .filter((item): item is PremiumProviderProduct => Boolean(item))
    .filter(isAvailable)
    .map(toCatalogProduct)
    .sort((a, b) => a.price - b.price || b.stock - a.stock || a.name.localeCompare(b.name, "id-ID"));
}

export async function getPremiumAppProduct(productId: string): Promise<Product | null> {
  const parsed = parsePremiumAppProductId(productId);
  if (!parsed) return null;

  const payload = await premiumRequest(`products/${encodeURIComponent(parsed.providerId)}`);
  let normalized = normalizeProviderProduct(payload);
  if (!normalized) {
    normalized = findArray(payload)
      .map(normalizeProviderProduct)
      .find((item) => item?.id === parsed.providerId) || null;
  }
  if (!normalized || !isAvailable(normalized)) return null;
  return toCatalogProduct(normalized);
}

const CREDENTIAL_LABELS: Array<[RegExp, string]> = [
  [/^(email|mail)$/i, "Email"],
  [/^(username|user|login|userid|user_id)$/i, "Username"],
  [/^(password|pass|passwd|pwd)$/i, "Password"],
  [/^(pin|profile_pin)$/i, "PIN"],
  [/^(profile|profil)$/i, "Profile"],
  [/^(license|license_key|key|serial)$/i, "Key"],
  [/^(link|url|invite|invite_url)$/i, "Link"],
  [/^(note|notes|catatan|instruction|instructions)$/i, "Catatan"],
  [/^(account|akun|credential|credentials|data_login|login_data)$/i, "Data Akun"],
];

function credentialLabel(key: string) {
  const normalized = key.trim().replace(/[ -]+/g, "_");
  return CREDENTIAL_LABELS.find(([pattern]) => pattern.test(normalized))?.[1] || "";
}

export function extractPremiumCredentials(value: unknown) {
  const output: string[] = [];
  const seen = new Set<string>();

  const add = (label: string, raw: unknown) => {
    const text = clean(raw, 3000);
    if (!text || text === "[object Object]" || seen.has(`${label}:${text}`)) return;
    seen.add(`${label}:${text}`);
    output.push(`${label}: ${text}`);
  };

  const walk = (current: unknown, depth: number, parentLabel = "") => {
    if (depth > 4 || current === null || current === undefined) return;
    if (typeof current === "string" || typeof current === "number") {
      if (parentLabel) add(parentLabel, current);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current.slice(0, 20)) walk(item, depth + 1, parentLabel);
      return;
    }
    if (!isRecord(current)) return;

    for (const [key, nested] of Object.entries(current)) {
      const label = credentialLabel(key);
      if (label) {
        if (isRecord(nested) || Array.isArray(nested)) walk(nested, depth + 1, label);
        else add(label, nested);
        continue;
      }
      if (/^(data|result|detail|details|account_data|delivery|output)$/i.test(key)) {
        walk(nested, depth + 1, parentLabel);
      }
    }
  };

  walk(value, 0);
  return output.join("\n").slice(0, 6000);
}

function normalizeOrder(value: unknown): PremiumProviderOrder {
  const raw = isRecord(value) ? value : {};
  const id = firstText(raw, ["id", "order_id", "orderId", "trxid", "trx_id", "transaction_id", "transactionId"]);
  const status = firstText(raw, ["status", "state", "order_status"]);
  const credentials = extractPremiumCredentials(raw);
  return { id, status, credentials, raw };
}

export function premiumOrderState(order: Pick<PremiumProviderOrder, "status" | "credentials">) {
  if (order.credentials) return "completed" as const;
  const status = clean(order.status).toUpperCase();
  if (/(SUCCESS|COMPLETED|COMPLETE|DONE|FINISH|FINISHED|DELIVERED)/.test(status)) return "completed" as const;
  if (/(CANCEL|CANCELED|CANCELLED|FAILED|ERROR|REFUND|REFUNDED|REJECT)/.test(status)) return "failed" as const;
  return "processing" as const;
}

export async function createPremiumAppOrder(providerProductId: string) {
  const payload = await premiumRequest("orders", {
    method: "POST",
    body: { product_id: providerProductId, quantity: 1 },
  });
  const order = normalizeOrder(payload);
  if (!order.id) {
    throw new Error("Supplier Premium Apps tidak mengembalikan ID order.");
  }
  return order;
}

export async function getPremiumAppOrder(providerOrderId: string) {
  const id = clean(providerOrderId, 200);
  if (!id) throw new Error("ID order Premium Apps tidak valid.");
  return normalizeOrder(await premiumRequest(`orders/${encodeURIComponent(id)}`));
}

export async function getPremiumAppsHistory() {
  return premiumRequest("history");
}
