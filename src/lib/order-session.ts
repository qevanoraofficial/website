import { createHmac, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const ORDER_SESSION_COOKIE = "digie_store_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function getSessionSecret(): string {
  const secret = process.env.ORDER_SESSION_SECRET || "";

  if (secret.length < 32) {
    throw new Error(
      "ORDER_SESSION_SECRET belum diatur atau terlalu pendek. Gunakan minimal 32 karakter."
    );
  }

  return secret;
}

function isValidToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,128}$/.test(value);
}

export function createOrderSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function readOrderSessionToken(
  request: NextRequest
): string | null {
  const value = request.cookies.get(ORDER_SESSION_COOKIE)?.value || "";
  return isValidToken(value) ? value : null;
}

export function createOrderOwnerKey(token: string): string {
  if (!isValidToken(token)) {
    throw new Error("Token sesi order tidak valid.");
  }

  return createHmac("sha256", getSessionSecret())
    .update(token)
    .digest("hex");
}

export function setOrderSessionCookie(
  response: NextResponse,
  token: string
): void {
  response.cookies.set({
    name: ORDER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearOrderSessionCookie(
  response: NextResponse
): void {
  response.cookies.set({
    name: ORDER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    throw new Error("Permintaan lintas situs ditolak.");
  }
}
