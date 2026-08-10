import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/order-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertMidtransEnvironmentSafety,
  createMidtransSnapTransaction,
} from "@/lib/midtrans";

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
          error: "Nominal top up minimal Rp10.000 dan maksimal Rp10.000.000.",
        },
        400
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name, phone, status")
      .eq("user_id", userData.user.id)
      .single();

    if (profileError || !profile || profile.status !== "active") {
      return jsonResponse({ ok: false, error: "Akun QEVANORA tidak aktif." }, 403);
    }

    const midtransEnvironment = assertMidtransEnvironmentSafety();
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin.rpc("service_create_topup", {
      p_user_id: userData.user.id,
      p_amount: amount,
      p_provider: "midtrans",
      p_method: "snap",
      p_fee: 0,
      p_external_id: null,
      p_checkout_url: null,
      p_qr_string: null,
      p_expires_at: expiresAt,
      p_metadata: {
        source: "qevanora_web",
        gateway: "midtrans_snap",
        midtrans_environment: midtransEnvironment,
      },
    });

    if (error) throw error;

    const topup = (Array.isArray(data) ? data[0] : data) as
      | {
          topup_id?: string;
          topup_code?: string;
          amount?: number | string;
          fee?: number | string;
          total_amount?: number | string;
        }
      | null;

    if (!topup?.topup_id || !topup.topup_code) {
      throw new Error("Data top up dari Supabase tidak lengkap.");
    }

    const totalAmount = Number(topup.total_amount || amount);
    const origin = request.nextUrl.origin;

    try {
      const payment = await createMidtransSnapTransaction({
        transaction_details: {
          order_id: topup.topup_code,
          gross_amount: totalAmount,
        },
        item_details: [
          {
            id: "QEV-WALLET-TOPUP",
            price: amount,
            quantity: 1,
            name: "Top Up Saldo QEVANORA",
          },
        ],
        customer_details: {
          first_name: profile.display_name || "Customer QEVANORA",
          email: userData.user.email || undefined,
          phone: profile.phone || undefined,
        },
        callbacks: {
          finish: `${origin}/profile?payment=finish#wallet-center`,
          error: `${origin}/profile?payment=error#wallet-center`,
        },
        expiry: {
          duration: 24,
          unit: "hours",
        },
        custom_field1: topup.topup_code,
        custom_field2: userData.user.id,
      });

      const { error: updateError } = await admin
        .from("topups")
        .update({
          external_id: topup.topup_code,
          checkout_url: payment.redirect_url,
          metadata: {
            source: "qevanora_web",
            gateway: "midtrans_snap",
            midtrans_environment: midtransEnvironment,
            snap_token: payment.token,
          },
        })
        .eq("id", topup.topup_id)
        .eq("status", "pending");

      if (updateError) throw updateError;

      return jsonResponse(
        {
          ok: true,
          topup: {
            ...topup,
            checkout_url: payment.redirect_url,
          },
          checkout_url: payment.redirect_url,
          message: "Pembayaran Midtrans berhasil dibuat. Kamu akan dialihkan ke halaman pembayaran.",
        },
        201
      );
    } catch (paymentError) {
      await admin
        .from("topups")
        .update({
          status: "failed",
          metadata: {
            source: "qevanora_web",
            gateway: "midtrans_snap",
            midtrans_environment: midtransEnvironment,
            error: paymentError instanceof Error ? paymentError.message : "midtrans_create_failed",
          },
        })
        .eq("id", topup.topup_id)
        .eq("status", "pending");
      throw paymentError;
    }
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
