import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const SANDBOX_BASE_URL = "https://api-sandbox.collaborator.komerce.id/user";
const PRODUCTION_BASE_URL = "https://api.collaborator.komerce.id/user";

export type KomerceEnvironment = "sandbox" | "production";

type JsonRecord = Record<string, unknown>;

type KomerceCustomer = {
  name: string;
  email: string;
  phone: string;
};

type KomerceItem = {
  name: string;
  quantity: number;
  price: number;
};

export type KomercePayment = {
  raw: JsonRecord;
  externalId: string | null;
  checkoutUrl: string | null;
  qrString: string | null;
  status: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function scalarToString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function findKomerceValue(value: unknown, keys: string[]): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [value];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (seen.has(current as object)) continue;
    seen.add(current as object);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, child] of Object.entries(current as JsonRecord)) {
      if (wanted.has(key.toLowerCase())) {
        const text = scalarToString(child);
        if (text) return text;
      }
      if (child && typeof child === "object") queue.push(child);
    }
  }

  return null;
}

function findUrl(value: unknown) {
  const preferred = findKomerceValue(value, [
    "checkout_url",
    "payment_url",
    "redirect_url",
    "payment_page_url",
    "deeplink_url",
    "web_url",
    "url",
  ]);

  if (preferred && /^https:\/\//i.test(preferred)) return preferred;
  return null;
}

function findQrString(value: unknown) {
  return findKomerceValue(value, [
    "qris_string",
    "qr_string",
    "qr_code",
    "qr_content",
    "qr_url",
    "qr_image_url",
  ]);
}

function getRequiredEnv(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} belum diatur di environment server.`);
  return value;
}

export function getKomerceEnvironment(): KomerceEnvironment {
  return String(process.env.KOMERCE_PAYMENT_IS_PRODUCTION || "").trim().toLowerCase() === "true"
    ? "production"
    : "sandbox";
}

export function assertKomerceEnvironmentSafety(): KomerceEnvironment {
  const environment = getKomerceEnvironment();
  const vercelEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();

  if (vercelEnvironment === "production" && environment !== "production") {
    throw new Error(
      "Komerce masih sandbox pada deployment production. Set KOMERCE_PAYMENT_IS_PRODUCTION=true setelah Live Mode disetujui."
    );
  }

  getRequiredEnv("KOMERCE_PAYMENT_API_KEY");
  return environment;
}

function getConfig() {
  const environment = assertKomerceEnvironmentSafety();
  const apiKey = getRequiredEnv("KOMERCE_PAYMENT_API_KEY");
  const callbackApiKey = getRequiredEnv("KOMERCE_CALLBACK_API_KEY");
  const paymentType = getRequiredEnv("KOMERCE_PAYMENT_TYPE");
  const channelCode = getRequiredEnv("KOMERCE_PAYMENT_CHANNEL_CODE");

  return {
    environment,
    apiKey,
    callbackApiKey,
    paymentType,
    channelCode,
    baseUrl: environment === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL,
  };
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      findKomerceValue(payload, ["message", "error", "detail"]) ||
      `Komerce Payment API gagal (${response.status}).`;
    throw new Error(message);
  }

  const record = asRecord(payload);
  if (!record) throw new Error("Respons Komerce Payment API tidak valid.");
  return record;
}

export async function createKomercePayment(input: {
  orderId: string;
  amount: number;
  customer: KomerceCustomer;
  items: KomerceItem[];
  callbackUrl: string;
  expiryDuration?: number;
}): Promise<KomercePayment> {
  const config = getConfig();

  const response = await fetch(`${config.baseUrl}/api/v1/user/payment/create`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      order_id: input.orderId,
      payment_type: config.paymentType,
      channel_code: config.channelCode,
      amount: input.amount,
      customer: input.customer,
      items: input.items,
      expiry_duration: input.expiryDuration ?? 86_400,
      callback_url: input.callbackUrl,
      callback_api_key: config.callbackApiKey,
    }),
  });

  const raw = await parseJsonResponse(response);
  const externalId = findKomerceValue(raw, ["payment_id", "transaction_id", "id"]);
  const checkoutUrl = findUrl(raw);
  const qrString = findQrString(raw);
  const status = findKomerceValue(raw, ["payment_status", "transaction_status", "status"]);

  if (!checkoutUrl && !qrString) {
    throw new Error(
      "Komerce berhasil merespons tetapi tidak mengembalikan URL/QR pembayaran yang dikenali. Periksa kode channel QRIS dari endpoint /methods."
    );
  }

  return { raw, externalId, checkoutUrl, qrString, status };
}

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyKomerceCallbackSignature(rawBody: string, signature: string | null) {
  const secret = getRequiredEnv("KOMERCE_CALLBACK_API_KEY");
  const supplied = String(signature || "").trim().replace(/^sha256=/i, "");
  if (!supplied) return false;

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();

  if (/^[a-f0-9]{64}$/i.test(supplied)) {
    return safeEqual(Buffer.from(supplied, "hex"), digest);
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(supplied)) {
    try {
      return safeEqual(Buffer.from(supplied, "base64"), digest);
    } catch {
      return false;
    }
  }

  return false;
}

export function summarizeKomerceResponse(raw: JsonRecord) {
  return {
    payment_id: findKomerceValue(raw, ["payment_id", "transaction_id", "id"]),
    status: findKomerceValue(raw, ["payment_status", "transaction_status", "status"]),
    payment_type: findKomerceValue(raw, ["payment_type"]),
    channel_code: findKomerceValue(raw, ["channel_code", "channel"]),
  };
}
