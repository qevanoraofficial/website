import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import { isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NokosServer = "s1" | "s2";

type ExportPriceRow = {
  code: string;
  rawCost: number;
  providerPrice: number;
  stock: number;
};

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInt(value: string | null) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizePrice(value: unknown) {
  const parsed = num(value, 0);
  if (parsed <= 0) return 0;
  if (parsed < 100) return Math.max(1, Math.round(parsed * 1000));
  return Math.round(parsed);
}

function apiBaseUrl() {
  return String(process.env.NOKOS_API_URL || "https://nokos.co.id/api/").trim();
}

function apiKey() {
  const key = String(process.env.NOKOS_API_KEY || "").trim();
  if (!key) throw new Error("NOKOS_API_KEY belum diatur.");
  return key;
}

async function getRawPrices(country: number, server: NokosServer) {
  const url = new URL(apiBaseUrl());
  url.searchParams.set("action", "getPrices");
  url.searchParams.set("country", String(country));
  url.searchParams.set("server", server);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey(),
    },
    cache: "no-store",
  });

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Nokos getPrices mengembalikan respons non-JSON (HTTP ${response.status}).`,
    );
  }

  const payload = isRecord(parsed) ? parsed : null;
  if (!response.ok || payload?.success === false || payload?.error) {
    const reason = String(
      payload?.error || payload?.message || `HTTP ${response.status}`,
    ).trim();
    throw new Error(`Nokos getPrices gagal: ${reason || "respons tidak valid"}.`);
  }

  let data: unknown = parsed;
  if (payload) {
    if (payload.data !== undefined) data = payload.data;
    else if (payload.result !== undefined) data = payload.result;
    else if (payload.prices !== undefined) data = payload.prices;
    else if (payload.price !== undefined) data = payload.price;
    else {
      const envelopeLike =
        "success" in payload ||
        "error" in payload ||
        "message" in payload ||
        "data" in payload;
      if (envelopeLike) {
        throw new Error("Nokos getPrices tidak mengembalikan data harga.");
      }
      data = payload;
    }
  }

  if (!isRecord(data)) {
    throw new Error("Format data harga Nokos tidak dikenali.");
  }

  const nested = data[String(country)];
  const priceMap =
    isRecord(nested) && !("cost" in nested)
      ? nested
      : data;

  const products: ExportPriceRow[] = [];
  for (const [code, value] of Object.entries(priceMap)) {
    if (!isRecord(value)) continue;

    const rawCost = num(value.cost, 0);
    const providerPrice = normalizePrice(rawCost);
    const stock = Math.max(0, Math.trunc(num(value.count, 0)));

    if (rawCost <= 0 && stock <= 0) continue;

    products.push({
      code: String(code),
      rawCost,
      providerPrice,
      stock,
    });
  }

  products.sort((a, b) => a.code.localeCompare(b.code));
  return products;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifyAdminSessionToken(session)) {
    return noStore({ ok: false, error: "Admin session diperlukan." }, 403);
  }

  if (!isNokosConfigured()) {
    return noStore(
      { ok: false, configured: false, error: "Nokos belum dikonfigurasi." },
      503,
    );
  }

  const country = safeInt(request.nextUrl.searchParams.get("country"));
  const serverParam = request.nextUrl.searchParams.get("server");
  const server: NokosServer | null =
    serverParam === "s1" ? "s1" : serverParam === "s2" ? "s2" : null;

  if (!country) {
    return noStore({ ok: false, error: "Parameter country wajib berupa ID negara." }, 400);
  }
  if (!server) {
    return noStore({ ok: false, error: "Parameter server wajib s1 atau s2." }, 400);
  }

  try {
    const products = await getRawPrices(country, server);

    return noStore({
      ok: true,
      configured: true,
      checkedAt: new Date().toISOString(),
      country,
      server,
      totalEntries: products.length,
      products,
    });
  } catch (error) {
    return noStore(
      {
        ok: false,
        configured: true,
        country,
        server,
        error:
          error instanceof Error
            ? error.message
            : "Gagal mengambil harga Nokos.",
      },
      424,
    );
  }
}
