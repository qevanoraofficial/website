import { NextResponse } from "next/server";
import { getNokosReference, isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isNokosConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Layanan Nokos belum dikonfigurasi." },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { services, countries } = await getNokosReference();
    return NextResponse.json(
      { ok: true, services, countries },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Referensi Nokos gagal dimuat.",
      },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }
}
