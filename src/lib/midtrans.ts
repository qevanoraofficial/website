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

function getServerKey() {
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || "").trim();
  if (!serverKey) {
    throw new Error(
      "MIDTRANS_SERVER_KEY belum diatur di Vercel. Gunakan Server Key Midtrans Sandbox terlebih dahulu."
    );
  }
  return serverKey;
}

export function isMidtransProduction() {
  return String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true";
}

function snapBaseUrl() {
  return isMidtransProduction()
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

export async function createMidtransSnapTransaction(payload: Record<string, unknown>) {
  const serverKey = getServerKey();
  const authorization = Buffer.from(`${serverKey}:`).toString("base64");

  const response = await fetch(`${snapBaseUrl()}/snap/v1/transactions`, {
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
