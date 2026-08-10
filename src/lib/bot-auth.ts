import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Fingerprint SHA-256 dari secret integrasi QEVANORA.
// Secret aslinya tidak disimpan di source code.
const FALLBACK_WEBTOOLS_SECRET_SHA256 =
  "9c3818970a256ce9f947a7552ba344af1940834c4e9686fa0d6264dd2e7414f7";

function safeEqual(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeConfiguredSecret(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // Toleransi jika value di dashboard tidak sengaja ditempel sebagai
  // WEBTOOLS_API_SECRET=xxxxxxxx, bukan hanya xxxxxxxx.
  const equalsIndex = raw.indexOf("=");
  if (equalsIndex > 0) {
    const key = raw.slice(0, equalsIndex).trim();
    if (key === "WEBTOOLS_API_SECRET" || key === "BOT_API_SECRET") {
      return raw.slice(equalsIndex + 1).trim();
    }
  }

  return raw;
}

function getAllowedApiSecrets(): string[] {
  return [process.env.BOT_API_SECRET, process.env.WEBTOOLS_API_SECRET]
    .map(normalizeConfiguredSecret)
    .filter(
      (value, index, values) =>
        value.length >= 24 && values.indexOf(value) === index,
    );
}

function getSuppliedSecret(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const headerSecret = request.headers.get("x-bot-api-secret")?.trim() || "";

  return bearer || headerSecret;
}

export function isBotAuthorized(request: Request): boolean {
  const supplied = getSuppliedSecret(request);
  if (!supplied) return false;

  // Utama: cocokkan dengan Environment Variable Vercel.
  const configuredMatch = getAllowedApiSecrets().some((expected) =>
    safeEqual(expected, supplied),
  );
  if (configuredMatch) return true;

  // Fallback aman: hanya fingerprint SHA-256 yang disimpan di repo.
  // Ini membuat integrasi tetap bekerja walau Environment Variable production
  // belum terpasang/redeploy atau value-nya sempat salah format.
  return safeEqual(sha256(supplied), FALLBACK_WEBTOOLS_SECRET_SHA256);
}

export function requireBotAuthorization(request: Request): void {
  if (!isBotAuthorized(request)) {
    throw new Error("BOT_UNAUTHORIZED");
  }
}
