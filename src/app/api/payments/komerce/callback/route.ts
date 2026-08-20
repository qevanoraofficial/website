import { NextRequest, NextResponse } from "next/server";
import {
  assertKomerceEnvironmentSafety,
  findKomerceValue,
  verifyKomerceCallbackSignature,
} from "@/lib/komerce-payment";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function normalizeStatus(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

function parseAmount(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const environment = assertKomerceEnvironmentSafety();
    const rawBody = await request.text();
    const signature = request.headers.get("x-callback-api-key");

    if (!verifyKomerceCallbackSignature(rawBody, signature)) {
      return jsonResponse({ ok: false, error: "invalid_signature" }, 403);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ ok: false, error: "invalid_json" }, 400);
    }

    const orderId = findKomerceValue(payload, ["order_id", "order_no", "reference_id"]);
    const externalId = findKomerceValue(payload, ["payment_id", "transaction_id", "id"]);
    const status = normalizeStatus(
      findKomerceValue(payload, ["payment_status", "transaction_status", "status"])
    );
    const paymentType = findKomerceValue(payload, ["payment_type"]);
    const channelCode = findKomerceValue(payload, ["channel_code", "channel"]);
    const amount = parseAmount(findKomerceValue(payload, ["amount", "gross_amount", "total_amount"]));

    if (!orderId) {
      return jsonResponse({ ok: true, ignored: "missing_order_id" });
    }

    const admin = createAdminClient();
    const { data: topup, error: topupError } = await admin
      .from("topups")
      .select("id, topup_code, status, total_amount, payment_provider")
      .eq("topup_code", orderId)
      .maybeSingle();

    if (topupError) throw topupError;
    if (!topup) return jsonResponse({ ok: true, ignored: "topup_not_found" });
    if (topup.payment_provider !== "komerce") {
      return jsonResponse({ ok: true, ignored: "provider_mismatch" });
    }

    const commonMetadata = {
      source: "qevanora_web",
      gateway: "komerce_payment_api",
      komerce_environment: environment,
      payment_id: externalId || null,
      payment_status: status || null,
      payment_type: paymentType || null,
      channel_code: channelCode || null,
    };

    const paidStatuses = new Set(["paid", "success", "successful", "settlement", "settled", "completed"]);
    const expiredStatuses = new Set(["expired", "expire"]);
    const cancelledStatuses = new Set(["cancelled", "canceled", "cancel"]);
    const failedStatuses = new Set(["failed", "failure", "deny", "denied"]);

    if (paidStatuses.has(status)) {
      if (amount === null) {
        return jsonResponse({ ok: false, error: "missing_amount" }, 400);
      }
      if (Number(topup.total_amount) !== amount) {
        return jsonResponse({ ok: false, error: "amount_mismatch" }, 400);
      }

      const { data, error } = await admin.rpc("service_complete_topup", {
        p_topup_ref: orderId,
        p_external_id: externalId || orderId,
        p_metadata: commonMetadata,
      });
      if (error) throw error;
      return jsonResponse({ ok: true, action: "credited", result: data });
    }

    if (expiredStatuses.has(status)) {
      const { error } = await admin
        .from("topups")
        .update({ status: "expired", external_id: externalId || null, metadata: commonMetadata })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ ok: true, action: "expired" });
    }

    if (cancelledStatuses.has(status)) {
      const { error } = await admin
        .from("topups")
        .update({ status: "cancelled", external_id: externalId || null, metadata: commonMetadata })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ ok: true, action: "cancelled" });
    }

    if (failedStatuses.has(status)) {
      const { error } = await admin
        .from("topups")
        .update({ status: "failed", external_id: externalId || null, metadata: commonMetadata })
        .eq("id", topup.id)
        .eq("status", "pending");
      if (error) throw error;
      return jsonResponse({ ok: true, action: "failed" });
    }

    const { error: updateError } = await admin
      .from("topups")
      .update({
        external_id: externalId || null,
        payment_method: channelCode || paymentType || "komerce",
        metadata: commonMetadata,
      })
      .eq("id", topup.id)
      .eq("status", "pending");

    if (updateError) throw updateError;
    return jsonResponse({ ok: true, action: "pending_or_ignored" });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "komerce_callback_failed",
      },
      500
    );
  }
}
