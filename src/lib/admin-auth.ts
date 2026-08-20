import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const ADMIN_SESSION_COOKIE = "qevanora_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

type AdminSessionPayload = {
  version: 1;
  expiresAt: number;
  nonce: string;
};

type AdminCredential = {
  password_salt: string;
  password_hash: string;
};

export type AdminLoginRateStatus = {
  allowed: boolean;
  retryAfterSeconds: number;
  failureCount: number;
};

function getSessionSecret(): string {
  const secret =
    process.env.ADMIN_SESSION_SECRET || process.env.ORDER_SESSION_SECRET || "";

  if (secret.length < 32) {
    throw new Error(
      "ADMIN_SESSION_SECRET atau ORDER_SESSION_SECRET wajib minimal 32 karakter.",
    );
  }

  return secret;
}

function getRateLimitSecret(): string {
  const secret =
    process.env.ADMIN_RATE_LIMIT_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ORDER_SESSION_SECRET ||
    "";

  if (secret.length < 32) {
    throw new Error(
      "ADMIN_RATE_LIMIT_SECRET, ADMIN_SESSION_SECRET, atau ORDER_SESSION_SECRET wajib minimal 32 karakter.",
    );
  }

  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

function clientAddress(request: Request): string {
  const cloudflareIp = String(request.headers.get("cf-connecting-ip") || "").trim();
  if (cloudflareIp) return cloudflareIp.slice(0, 128);

  const realIp = String(request.headers.get("x-real-ip") || "").trim();
  if (realIp) return realIp.slice(0, 128);

  const forwarded = String(request.headers.get("x-forwarded-for") || "")
    .split(",")[0]
    ?.trim();
  if (forwarded) return forwarded.slice(0, 128);

  return "unknown";
}

function normalizeRateRow(data: unknown): AdminLoginRateStatus {
  const row = Array.isArray(data) ? data[0] : data;
  const value = row && typeof row === "object" ? (row as Record<string, unknown>) : {};

  return {
    allowed: value.allowed !== false,
    retryAfterSeconds: Math.max(
      0,
      Math.trunc(Number(value.retry_after_seconds || 0)) || 0,
    ),
    failureCount: Math.max(0, Math.trunc(Number(value.failure_count || 0)) || 0),
  };
}

async function getAdminCredential(): Promise<AdminCredential> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_credentials")
    .select("password_salt,password_hash")
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error("Credential admin tidak tersedia.");
  }

  const passwordSalt = String(data.password_salt || "").trim();
  const passwordHash = String(data.password_hash || "").trim().toLowerCase();

  if (!passwordSalt || !/^[0-9a-f]{128}$/.test(passwordHash)) {
    throw new Error("Credential admin tidak valid.");
  }

  return {
    password_salt: passwordSalt,
    password_hash: passwordHash,
  };
}

export function createAdminLoginRateKey(request: Request): string {
  return createHmac("sha256", getRateLimitSecret())
    .update(`admin-login-v1:${clientAddress(request)}`)
    .digest("hex");
}

export async function getAdminLoginRateStatus(
  rateKey: string,
): Promise<AdminLoginRateStatus> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "service_admin_login_rate_status_v1",
    { p_key_hash: rateKey },
  );

  if (error) {
    throw new Error("Status rate limit admin tidak tersedia.");
  }

  return normalizeRateRow(data);
}

export async function recordAdminLoginAttempt(
  rateKey: string,
  success: boolean,
): Promise<AdminLoginRateStatus> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "service_admin_login_rate_record_v1",
    { p_key_hash: rateKey, p_success: success },
  );

  if (error) {
    throw new Error("Pencatatan rate limit admin gagal.");
  }

  return normalizeRateRow(data);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || password.length > 256) {
    return false;
  }

  const credential = await getAdminCredential();
  const calculatedHash = scryptSync(password, credential.password_salt, 64);
  const expectedHash = Buffer.from(credential.password_hash, "hex");

  return (
    calculatedHash.length === expectedHash.length &&
    timingSafeEqual(calculatedHash, expectedHash)
  );
}

export function createAdminSessionToken(): string {
  const payload: AdminSessionPayload = {
    version: 1,
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000,
    nonce: randomBytes(18).toString("hex"),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAdminSessionToken(token?: string | null): boolean {
  if (!token) {
    return false;
  }

  const [encodedPayload, signature, ...rest] = token.split(".");

  if (!encodedPayload || !signature || rest.length > 0) {
    return false;
  }

  try {
    if (!safeEqual(signature, sign(encodedPayload))) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;

    return (
      payload.version === 1 &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Date.now() &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 16
    );
  } catch {
    return false;
  }
}
