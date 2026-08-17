import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderPayload = {
  success?: boolean;
  data?: unknown;
  availability?: unknown;
  stock?: unknown;
  error?: string;
  message?: string;
  available?: string | number;
  price?: string | number;
  cost?: string | number;
  count?: string | number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function minimumSafePrice() {
  const configured = integer(process.env.NOKOS_MIN_PROVIDER_PRICE || 50);
  return configured >= 1 ? configured : 50;
}

function sellingPrice(providerPrice: number) {
  const percent = Math.max(0, Number(process.env.NOKOS_MARKUP_PERCENT || 0) || 0);
  const flat = Math.max(0, Number(process.env.NOKOS_MARKUP_FLAT || 0) || 0);
  return Math.ceil(providerPrice * (1 + percent / 100) + flat);
}

function apiBase() {
  return String(process.env.NOKOS_API_URL || "https://nokos.co.id/api/").trim();
}

function apiKey() {
  return String(process.env.NOKOS_API_KEY || "").trim();
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=5",
    },
  });
}

function extractQuote(payload: ProviderPayload) {
  const candidates: unknown[] = [
    payload.data,
    payload.availability,
    payload.stock,
    payload,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const price = money(candidate.price ?? candidate.cost);
    const stock = Math.max(
      0,
      integer(candidate.available ?? candidate.count ?? candidate.stock),
    );
    if (price > 0 || stock > 0) return { price, stock };
  }

  return { price: 0, stock: 0 };
}

export async function GET(request: NextRequest) {
  const key = apiKey();
  if (!key) {
    return json({ ok: false, error: "NOKOS belum dikonfigurasi." }, 424);
  }

  const params = request.nextUrl.searchParams;
  const service = String(params.get("service") || "")
    .trim()
    .slice(0, 80)
    .replace(/[^A-Za-z0-9._-]/g, "");
  const country = integer(params.get("country"));
  const server = params.get("server") === "s1" ? "s1" : "s2";

  if (!service || country < 0) {
    return json({ ok: false, error: "Parameter quote tidak valid." }, 400);
  }

  const url = new URL(apiBase());
  url.searchParams.set("action", "getAvailability");
  url.searchParams.set("service", service);
  url.searchParams.set("country", String(country));
  url.searchParams.set("server", server);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-API-Key": key,
      },
      cache: "no-store",
    });
  } catch {
    return json(
      { ok: false, error: "Provider tidak dapat dihubungi." },
      424,
    );
  }

  const raw = await response.text();
  let payload: ProviderPayload;
  try {
    payload = JSON.parse(raw) as ProviderPayload;
  } catch {
    return json(
      {
        ok: false,
        error: `Provider mengembalikan respons non-JSON (HTTP ${response.status}).`,
      },
      424,
    );
  }

  if (!response.ok || payload.success === false || payload.error) {
    return json(
      {
        ok: false,
        error: String(
          payload.error ||
            payload.message ||
            `Provider HTTP ${response.status}`,
        ),
      },
      424,
    );
  }

  const quote = extractQuote(payload);
  if (quote.price < minimumSafePrice() || quote.stock <= 0) {
    return json(
      {
        ok: false,
        code: "LIVE_QUOTE_UNAVAILABLE",
        error: "Harga/stok live provider belum valid untuk layanan ini.",
      },
      424,
    );
  }

  return json({
    ok: true,
    service,
    country,
    server,
    providerPrice: quote.price,
    sellingPrice: sellingPrice(quote.price),
    stock: quote.stock,
    source: "getAvailability",
    checkedAt: new Date().toISOString(),
  });
}
