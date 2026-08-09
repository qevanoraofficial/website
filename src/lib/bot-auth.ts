import "server-only";
import { timingSafeEqual } from "node:crypto";

function safeEqual(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

function getAllowedApiSecrets(): string[] {
  return [process.env.BOT_API_SECRET, process.env.WEBTOOLS_API_SECRET]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => value.length >= 24 && values.indexOf(value) === index);
}

export function isBotAuthorized(request: Request): boolean {
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : request.headers.get("x-bot-api-secret")?.trim() || "";

  if (!supplied) return false;
  return getAllowedApiSecrets().some((expected) => safeEqual(expected, supplied));
}

export function requireBotAuthorization(request: Request): void {
  if (!isBotAuthorized(request)) {
    throw new Error("BOT_UNAUTHORIZED");
  }
}
