import { NextRequest, NextResponse } from "next/server";
import { getFollowProductsPage, isFollowConfigured } from "@/lib/follow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isFollowConfigured()) {
      return NextResponse.json(
        { ok: false, error: "FOLLOW_API_KEY belum diatur di Vercel." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    const limit = Number(request.nextUrl.searchParams.get("limit") || 24);
    const search = request.nextUrl.searchParams.get("search") || "";
    const result = await getFollowProductsPage({ page, limit, search });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Layanan supplier gagal dibaca.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
