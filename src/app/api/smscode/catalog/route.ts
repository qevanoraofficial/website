import { NextRequest, NextResponse } from "next/server";
import { getSmscodeCatalog, isSmscodeConfigured } from "@/lib/smscode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intParam(value: string | null, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  if (!isSmscodeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Layanan SMSCode belum dikonfigurasi." },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const sortParam = url.searchParams.get("sort");
    const sort =
      sortParam === "price" || sortParam === "stock" || sortParam === "name"
        ? sortParam
        : "popular";

    const result = await getSmscodeCatalog({
      country: String(url.searchParams.get("country") || "ID").slice(0, 12),
      search: String(url.searchParams.get("search") || "").slice(0, 100),
      sort,
      minStock: Math.max(0, intParam(url.searchParams.get("minStock"), 0)),
      maxPrice: Math.max(0, intParam(url.searchParams.get("maxPrice"), 0)),
      page: Math.max(1, intParam(url.searchParams.get("page"), 1)),
      limit: intParam(url.searchParams.get("limit"), 24),
    });

    return NextResponse.json(
      {
        ok: true,
        country: {
          id: result.country.id,
          code: result.country.code,
          name: result.country.name,
          dialCode: result.country.dial_code || "",
          emoji: result.country.emoji || "🌐",
        },
        products: result.products,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        limit: result.limit,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Katalog SMSCode gagal dimuat.",
      },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }
}
