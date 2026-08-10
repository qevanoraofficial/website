import { NextResponse } from "next/server";
import { getFollowServices, isFollowConfigured } from "@/lib/follow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isFollowConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "FOLLOW_API_KEY belum diatur di Vercel.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await getFollowServices({ force: true });

    return NextResponse.json(
      {
        ok: true,
        configured: true,
        provider: "follow.co.id",
        serviceCount: result.services.length,
        rateCurrency: result.currency,
        currencySource: result.currencySource,
        cacheTtlSeconds: 300,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        provider: "follow.co.id",
        error: error instanceof Error ? error.message : "Follow.co.id gagal diperiksa.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
