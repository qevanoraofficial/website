import { NextRequest, NextResponse } from "next/server";
import {
  assertMidtransEnvironmentSafety,
  type MidtransNotification,
  verifyMidtransNotificationSignature,
} from "@/lib/midtrans";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: NextRequest) {
  let payload: MidtransNotification;

  try {
    payload = (await request.json()) as MidtransNotification;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  try {
    const midtransEnvironment = assertMidtransEnvironmentSafety();

    if (!verifyMidtransNotificationSignature(payload)) {
      return jsonResponse({ ok: false, error: "invalid_signature" }, 403);
    }

    const orderId = String(payload.order_id || "").trim();
    const transactionId = String(payload.transaction_id || "").trim();
    const transactionStatus = String(payload.transaction_status || "").toLowerCase();
    const paymentType = String(payload.payment_type || "").trim();
    const fraudStatus = String(payload.fraud_status || "").toLowerCase();
    const statusCode = String(payload.status_code || "");
    const grossAmount = Number(payload.gross_amount || 0);

    if (!orderId) {
      return jsonResponse({ ok: true, ignored: "missing_order_id" });
    }

    const admin = createAdminClient();
    const { data: topup, error: topupError } = await admin
      .from("topups")
      .select("id, topup_code, status, total_amount")
      .eq("topup_code", orderId)
      .maybeSingle();

    if (topupError) throw topupError;
    if (!topup) {
      return jsonResponse({ ok: true, ignored: "topup_not_found" });
    }

    if (Number(topup.total_amount) !== grossAmount) {
      return jsonResponse({ ok: false, error: "amount_mismatch" }, 400);
    }

    const commonMetadata = {
      gateway: "midtrans_snap",
      midtrans_environment: midtransEnvironment,
      transaction_id: transactionId || null,
      transaction_status: transactionStatus,
      payment_type: paymentType || null,
      status_code: statusCode || null,
      fraud_status: fraudStatus || null,
      status_message: payload.status_message || null,
      settlement_time: payload.settlement_time || null,
    };

    const isSuccessful =
      statusCode === "200" &&
      (!fraudStatus || fraudStatus === "accept") &&
      (transactionStatus === "settlement" || transactionStatus === "capture");

    if (isSuccessful) {
      const { data, error } = await admin.rpc("service_complete_topup", {
        p_topup_ref: orderId,
        p_external_id: transactionId || orderId,
        p_metadata: commonMetadata,
      });
      if (error) throw error;
      return jsonResponse({ ok: true, action: "credited", result: data });
    }

    if (transactionStatus === "expire") {
      const { error } = await admin
        .from("topups")
        .update({ status: "expired", external_id: transactionId || null, metadata: commonMetadata })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ ok: true, action: "expired" });
    }

    if (transactionStatus === "cancel") {
      const { error } = await admin
        .from("topups")
        .update({ status: "cancelled", external_id: transactionId || null, metadata: commonMetadata })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ ok: true, action: "cancelled" });
    }

    if (transactionStatus === "deny") {
      const { error } = await admin
        .from("topups")
        .update({ status: "failed", external_id: transactionId || null, metadata: commonMetadata })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ ok: true, action: "failed" });
    }

    if (transactionStatus === "pending") {
      const { error } = await admin
        .from("topups")
        .update({
          external_id: transactionId || null,
          payment_method: paymentType || "snap",
          metadata: commonMetadata,
        })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
    }

    return jsonResponse({ ok: true, action: "pending_or_ignored" });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "notification_failed",
      },
      500
    );
  }
}
