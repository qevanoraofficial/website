import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/order-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_TOPUP = 10_000;
const MAX_TOPUP = 10_000_000;

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ ok: false, error: "Silakan masuk ke akun QEVANORA." }, 401);
    }

    const body = (await request.json().catch(() => ({}))) as { amount?: unknown };
    const amount = Math.round(Number(body.amount));

    if (!Number.isSafeInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
      return jsonResponse(
        {
          ok: false,
          error: `Nominal top up minimal Rp10.000 dan maksimal Rp10.000.000.`,
        },
        400
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("user_id", userData.user.id)
      .single();

    if (profileError || !profile || profile.status !== "active") {
      return jsonResponse({ ok: false, error: "Akun QEVANORA tidak aktif." }, 403);
    }

    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.rpc("service_create_topup", {
      p_user_id: userData.user.id,
      p_amount: amount,
      p_provider: "manual",
      p_method: "admin_confirmation",
      p_fee: 0,
      p_external_id: null,
      p_checkout_url: null,
      p_qr_string: null,
      p_expires_at: expiresAt,
      p_metadata: {
        source: "qevanora_web",
        note: "Menunggu konfirmasi admin sebelum payment gateway diaktifkan.",
      },
    });

    if (error) throw error;

    const topup = Array.isArray(data) ? data[0] : data;

    return jsonResponse(
      {
        ok: true,
        topup,
        message:
          "Permintaan top up dibuat. Hubungi admin/Support untuk pembayaran. Saldo masuk setelah admin mengonfirmasi pembayaran.",
      },
      201
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Top up gagal dibuat.",
      },
      500
    );
  }
}
