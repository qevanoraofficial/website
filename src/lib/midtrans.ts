import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export type MidtransSnapResponse = {
  token: string;
  redirect_url: string;
};

export type MidtransNotification = {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  transaction_id?: string;
  payment_type?: string;
  fraud_status?: string;
  status_message?: string;
  settlement_time?: string;
  expiry_time?: string;
  [key: string]: unknown;
};

export type MidtransEnvironment = "sandbox" | "production";

function getServerKey() {
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || "").trim();
  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY belum diatur di Vercel.");
  }
  return serverKey;
}

export function getMidtransEnvironment(): MidtransEnvironment {
  const raw = String(process.env.MIDTRANS_IS_PRODUCTION ?? "").trim().toLowerCase();
  if (raw === "true") return "production";
  if (raw === "false") return "sandbox";
  throw new Error("MIDTRANS_IS_PRODUCTION wajib diatur ke true atau false.");
}

export function isMidtransProduction() {
  return getMidtransEnvironment() === "production";
}

export function assertMidtransEnvironmentSafety() {
  const environment = getMidtransEnvironment();
  const vercelEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();

  // Fail closed on the live Vercel deployment: a Sandbox settlement must never
  // be able to create spendable QEVANORA balance on the production website.
  if (vercelEnvironment === "production" && environment !== "production") {
    throw new Error(
      "Top up dinonaktifkan: website Production masih memakai Midtrans Sandbox. Pasang Production Server Key lalu set MIDTRANS_IS_PRODUCTION=true."
    );
  }

  return environment;
}

function snapBaseUrl(environment: MidtransEnvironment) {
  return environment === "production"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

export function getMidtransPublicStatus() {
  let environment: MidtransEnvironment | "invalid" = "invalid";
  try {
    environment = getMidtransEnvironment();
  } catch {
    // Keep health output secret-free and descriptive.
  }

  const configured = Boolean(String(process.env.MIDTRANS_SERVER_KEY || "").trim());
  const vercelEnvironment = String(process.env.VERCEL_ENV || "unknown").trim().toLowerCase();
  const productionReady =
    configured && environment === "production" && vercelEnvironment === "production";

  return {
    configured,
    environment,
    vercelEnvironment,
    productionReady,
  };
}

export async function createMidtransSnapTransaction(payload: Record<string, unknown>) {
  const environment = assertMidtransEnvironmentSafety();
  const serverKey = getServerKey();
  const authorization = Buffer.from(`${serverKey}:`).toString("base64");

  const response = await fetch(`${snapBaseUrl(environment)}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${authorization}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as Partial<MidtransSnapResponse> & {
    error_messages?: string[];
    status_message?: string;
  };

  if (!response.ok || !data.token || !data.redirect_url) {
    const detail =
      data.error_messages?.join("; ") || data.status_message || `HTTP ${response.status}`;
    throw new Error(`Midtrans gagal membuat pembayaran: ${detail}`);
  }

  return data as MidtransSnapResponse;
}

export function verifyMidtransNotificationSignature(payload: MidtransNotification) {
  const orderId = String(payload.order_id || "");
  const statusCode = String(payload.status_code || "");
  const grossAmount = String(payload.gross_amount || "");
  const incoming = String(payload.signature_key || "").toLowerCase();

  if (!orderId || !statusCode || !grossAmount || !incoming) return false;

  const expected = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${getServerKey()}`)
    .digest("hex")
    .toLowerCase();

  const expectedBuffer = Buffer.from(expected, "utf8");
  const incomingBuffer = Buffer.from(incoming, "utf8");
  if (expectedBuffer.length !== incomingBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, incomingBuffer);
}
