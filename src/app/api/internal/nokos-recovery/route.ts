import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncRecentNokosOrders } from "@/lib/nokos-order-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURPOSE = "qevanora:nokos-recovery:v1";

function recoverySecret() {
  const secret = String(
    process.env.NOKOS_RECOVERY_SECRET || process.env.ORDER_SESSION_SECRET || "",
  ).trim();
  if (secret.length < 32) {
    throw new Error(
      "NOKOS recovery membutuhkan NOKOS_RECOVERY_SECRET atau ORDER_SESSION_SECRET minimal 32 karakter.",
    );
  }
  return secret;
}

function expectedToken() {
  return createHmac("sha256", recoverySecret()).update(PURPOSE).digest("hex");
}

function safeTokenEqual(supplied: string | null) {
  const value = String(supplied || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  const expected = Buffer.from(expectedToken(), "hex");
  const received = Buffer.from(value, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  try {
    if (!safeTokenEqual(request.headers.get("x-qevanora-recovery-token"))) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const admin = createAdminClient();
    const stats = await syncRecentNokosOrders(admin);
    return NextResponse.json(
      { ok: true, ...stats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[nokos] scheduled recovery gagal", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "nokos_recovery_failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
