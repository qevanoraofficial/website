import { NextRequest, NextResponse } from "next/server";
import { readOrderSessionToken } from "@/lib/order-session";
import { recordVisitor } from "@/lib/visitor-stats";
import type { VisitorKind } from "@/lib/visitor-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 6;

function isSameOrigin(request: NextRequest): boolean {
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

function visitorCookie(kind: VisitorKind): string {
  return kind === "member"
    ? "qevanora_member_counted"
    : "qevanora_guest_counted";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "Origin tidak diizinkan." },
      { status: 403 },
    );
  }

  const kind: VisitorKind = readOrderSessionToken(request)
    ? "member"
    : "guest";
  const cookieName = visitorCookie(kind);

  if (request.cookies.get(cookieName)?.value === "1") {
    return NextResponse.json(
      { ok: true, counted: false, kind },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await recordVisitor(kind);

    const response = NextResponse.json(
      { ok: true, counted: true, kind },
      { headers: { "Cache-Control": "no-store" } },
    );

    response.cookies.set(cookieName, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Statistik pengunjung gagal disimpan.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
