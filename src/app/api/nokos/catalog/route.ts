import { NextRequest, NextResponse } from "next/server";
import { getNokosCatalog, isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isNokosConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Layanan Nokos belum dikonfigurasi." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const country = Number(url.searchParams.get("country") || 6);
    const search = String(url.searchParams.get("search") || "").slice(0, 100);
    const page = Number(url.searchParams.get("page") || 1);
    const limit = Number(url.searchParams.get("limit") || 24);
    const result = await getNokosCatalog({ country, search, page, limit });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Layanan Nokos gagal dimuat.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
