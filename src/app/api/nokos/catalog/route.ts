import { NextRequest, NextResponse } from "next/server";
import {
  getNokosCatalog,
  getNokosCheapestCatalog,
  isNokosConfigured,
} from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intParam(value: string | null, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  if (!isNokosConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Layanan Nokos belum dikonfigurasi." },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "cheapest" ? "cheapest" : "country";
    const serverParam = url.searchParams.get("server");
    const server = serverParam === "s1" ? "s1" : "s2";
    const page = intParam(url.searchParams.get("page"), 1);
    const limit = intParam(url.searchParams.get("limit"), 24);
    const minStock = Math.max(0, intParam(url.searchParams.get("minStock"), 0));
    const maxPrice = Math.max(0, intParam(url.searchParams.get("maxPrice"), 0));

    const result =
      mode === "cheapest"
        ? await getNokosCheapestCatalog({
            service: String(url.searchParams.get("service") || "").slice(0, 100),
            server,
            sort:
              url.searchParams.get("sort") === "stock"
                ? "stock"
                : url.searchParams.get("sort") === "name"
                  ? "name"
                  : "price",
            region:
              url.searchParams.get("region") === "southeast-asia" ||
              url.searchParams.get("region") === "europe" ||
              url.searchParams.get("region") === "americas" ||
              url.searchParams.get("region") === "africa"
                ? (url.searchParams.get("region") as
                    | "southeast-asia"
                    | "europe"
                    | "americas"
                    | "africa")
                : "all",
            minStock,
            maxPrice,
            page,
            limit,
          })
        : await getNokosCatalog({
            country: intParam(url.searchParams.get("country"), 6),
            server,
            search: String(url.searchParams.get("search") || "").slice(0, 100),
            sort:
              url.searchParams.get("sort") === "price"
                ? "price"
                : url.searchParams.get("sort") === "stock"
                  ? "stock"
                  : url.searchParams.get("sort") === "name"
                    ? "name"
                    : "popular",
            minStock,
            maxPrice,
            page,
            limit,
          });

    return NextResponse.json(
      { ok: true, mode, ...result },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Layanan Nokos gagal dimuat.",
      },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }
}
