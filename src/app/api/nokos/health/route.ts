import { NextResponse } from "next/server";
import { getNokosBalance, getNokosReference, isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isNokosConfigured()) {
    return NextResponse.json({ ok: false, configured: false, serviceCount: 0, countryCount: 0 });
  }

  try {
    // Probe auth dulu supaya error API key/akses terpisah dari katalog.
    await getNokosBalance();
    const { services, countries } = await getNokosReference({ force: true });
    return NextResponse.json({
      ok: true,
      configured: true,
      auth: true,
      serviceCount: services.length,
      countryCount: countries.length,
      cacheTtlSeconds: 600,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : "Pemeriksaan Nokos gagal.",
      },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }
}
