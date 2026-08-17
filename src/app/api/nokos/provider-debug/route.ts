import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiagnosticResult = {
  action: string;
  requestUrl: string;
  status: number | null;
  ok: boolean;
  contentType: string;
  json: unknown | null;
  textPreview: string | null;
  error: string | null;
};

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function baseUrl() {
  return String(process.env.NOKOS_API_URL || "https://nokos.co.id/api/").trim();
}

function apiKey() {
  return String(process.env.NOKOS_API_KEY || "").trim();
}

function safeInt(value: string | null, fallback: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizePreview(value: string) {
  return value
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")
    .slice(0, 1200);
}

async function callProvider(
  action: "getPrices" | "getAvailability",
  service: string,
  country: number,
  server: "s1" | "s2",
): Promise<DiagnosticResult> {
  const url = new URL(baseUrl());
  url.searchParams.set("action", action);
  url.searchParams.set("service", service);
  url.searchParams.set("country", String(country));
  url.searchParams.set("server", server);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey(),
      },
      cache: "no-store",
    });

    const raw = await response.text();
    let json: unknown | null = null;
    let textPreview: string | null = null;

    try {
      json = JSON.parse(raw);
    } catch {
      textPreview = sanitizePreview(raw);
    }

    return {
      action,
      requestUrl: `${url.origin}${url.pathname}?action=${action}&service=${encodeURIComponent(service)}&country=${country}&server=${server}`,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      json,
      textPreview,
      error: null,
    };
  } catch (error) {
    return {
      action,
      requestUrl: `${url.origin}${url.pathname}?action=${action}&service=${encodeURIComponent(service)}&country=${country}&server=${server}`,
      status: null,
      ok: false,
      contentType: "",
      json: null,
      textPreview: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(session)) {
    return noStore({ ok: false, error: "Admin session diperlukan." }, 403);
  }

  if (!apiKey()) {
    return noStore({ ok: false, error: "NOKOS_API_KEY belum dikonfigurasi." }, 503);
  }

  const params = request.nextUrl.searchParams;
  const service = String(params.get("service") || "wa")
    .trim()
    .slice(0, 80)
    .replace(/[^A-Za-z0-9._-]/g, "");
  const country = safeInt(params.get("country"), 6);
  const server: "s1" | "s2" = params.get("server") === "s1" ? "s1" : "s2";

  if (!service || country < 0) {
    return noStore({ ok: false, error: "Parameter tidak valid." }, 400);
  }

  const [prices, availability] = await Promise.all([
    callProvider("getPrices", service, country, server),
    callProvider("getAvailability", service, country, server),
  ]);

  return noStore({
    ok: true,
    checkedAt: new Date().toISOString(),
    input: { service, country, server },
    apiBase: baseUrl(),
    apiKeyConfigured: true,
    prices,
    availability,
  });
}
