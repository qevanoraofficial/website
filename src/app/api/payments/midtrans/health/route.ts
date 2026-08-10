import { NextResponse } from "next/server";
import { getMidtransPublicStatus } from "@/lib/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getMidtransPublicStatus();
  return NextResponse.json(
    {
      ok: status.productionReady,
      provider: "midtrans",
      ...status,
    },
    {
      status: status.productionReady ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
