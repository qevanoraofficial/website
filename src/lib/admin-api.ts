import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

export function isAdminRequest(request: NextRequest): boolean {
  return verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
}

export function adminUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Sesi admin tidak valid atau sudah berakhir." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
