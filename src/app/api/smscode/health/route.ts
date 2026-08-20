import { NextResponse } from "next/server";
import { checkSmscodeHealth, isSmscodeConfigured } from "@/lib/smscode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSmscodeConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "SMSCode belum dikonfigurasi." },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const health = await checkSmscodeHealth();
    return NextResponse.json(
      { ok: true, ...health },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        reachable: false,
        error: error instanceof Error ? error.message : "SMSCode tidak dapat dijangkau.",
      },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }
}
