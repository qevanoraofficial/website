import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/order-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertKomerceEnvironmentSafety,
  createKomercePayment,
  summarizeKomerceResponse,
} from "@/lib/komerce-payment";

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

    const email = String(userData.user.email || "").trim();
    const phone = String(profile.phone || "").trim();
    if (!email) {
      return jsonResponse({ ok: false, error: "Email akun diperlukan untuk pembayaran Komerce." }, 400);
    }
    if (!phone) {
      return jsonResponse(
        { ok: false, error: "Lengkapi nomor telepon profil sebelum melakukan top up." },
        400
      );
    }

    const komerceEnvironment = assertKomerceEnvironmentSafety();
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const configuredPaymentType = String(process.env.KOMERCE_PAYMENT_TYPE || "").trim().toLowerCase();
    const configuredChannelCode = String(process.env.KOMERCE_PAYMENT_CHANNEL_CODE || "").trim();
    const paymentMethod = configuredChannelCode || configuredPaymentType || "komerce";

    const { data, error } = await admin.rpc("service_create_topup", {
      p_user_id: userData.user.id,
      p_amount: amount,
      p_provider: "komerce",
      p_method: paymentMethod,
      p_fee: 0,
      p_external_id: null,
      p_checkout_url: null,
      p_qr_string: null,
      p_expires_at: expiresAt,
      p_metadata: {
        source: "qevanora_web",
        gateway: "komerce_payment_api",
        komerce_environment: komerceEnvironment,
        payment_type: configuredPaymentType || null,
        channel_code: configuredChannelCode || null,
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
      const payment = await createKomercePayment({
        orderId: topup.topup_code,
        amount: totalAmount,
        customer: {
          name: profile.display_name || "Customer QEVANORA",
          email,
          phone,
        },
        items: [
          {
            name: "Top Up Saldo QEVANORA",
            quantity: 1,
            price: totalAmount,
          },
        ],
        callbackUrl: `${origin}/api/payments/komerce/callback`,
        expiryDuration: 86_400,
      });

      const responseSummary = summarizeKomerceResponse(payment.raw);
      const resolvedPaymentMethod =
        responseSummary.channel_code || responseSummary.payment_type || paymentMethod;

      const { error: updateError } = await admin
        .from("topups")
        .update({
          external_id: payment.externalId || topup.topup_code,
          checkout_url: payment.checkoutUrl,
          qr_string: payment.qrString,
          payment_method: resolvedPaymentMethod,
          metadata: {
            source: "qevanora_web",
            gateway: "komerce_payment_api",
            komerce_environment: komerceEnvironment,
            payment_id: payment.externalId,
            payment_status: payment.status,
            payment_type: responseSummary.payment_type || configuredPaymentType || null,
            channel_code: responseSummary.channel_code || configuredChannelCode || null,
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
            checkout_url: payment.checkoutUrl,
            qr_string: payment.qrString,
          },
          checkout_url: payment.checkoutUrl,
          qr_string: payment.qrString,
          message: payment.checkoutUrl
            ? "Pembayaran Komerce berhasil dibuat. Kamu akan dialihkan ke halaman pembayaran."
            : "Pembayaran QRIS Komerce berhasil dibuat.",
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
            gateway: "komerce_payment_api",
            komerce_environment: komerceEnvironment,
            payment_type: configuredPaymentType || null,
            channel_code: configuredChannelCode || null,
            error: paymentError instanceof Error ? paymentError.message : "komerce_create_failed",
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
