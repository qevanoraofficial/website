import { NextResponse } from "next/server";
import {
  createSmscodeProviderOrder,
  finishSmscodeProviderOrder,
  getSmscodeProviderOrder,
  isAmbiguousSmscodeOrderError,
  smscodeOrderErrorCode,
} from "@/lib/smscode-orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderCode: string }> };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function int(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function customerPayload(input: Record<string, unknown>, supplier: Record<string, unknown>, orderStatus: string) {
  const otpCode = String(input.otpCode || supplier.otp_code || "");
  const phone = String(input.phone || supplier.phone_number || "");
  const expiresAt = String(input.expiresAt || supplier.expires_at || "");
  const providerStatus = String(supplier.status || "").toUpperCase();
  const finalStatus = orderStatus === "refunded" || orderStatus === "cancelled"
    ? "cancelled"
    : orderStatus === "completed" || otpCode
      ? "completed"
      : orderStatus === "failed"
        ? "failed"
        : "accepted";
  return {
    status: finalStatus,
    providerStatus,
    phone,
    otpCode,
    expiresAt,
    canCancel: finalStatus === "accepted" && Boolean(phone) && !otpCode,
    canResend: Boolean(supplier.can_resend) && finalStatus === "accepted",
    resendAvailableAt: String(supplier.resend_available_at || ""),
  };
}

async function refundIfPaid(
  admin: ReturnType<typeof createAdminClient>,
  order: { id: string; payment_status: string; payment_method: string | null },
  reason: string,
) {
  if (order.payment_method !== "wallet" || order.payment_status !== "paid") return undefined;
  const { data, error } = await admin.rpc("refund_order_to_wallet", {
    p_order_id: order.id,
    p_reason: reason,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.new_balance || 0);
}

export async function GET(_request: Request, { params }: Props) {
  try {
    const { orderCode } = await params;
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_code, user_id, status, payment_status, payment_method, created_at")
      .eq("order_code", orderCode)
      .eq("user_id", userData.user.id)
      .eq("supplier", "smscode")
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ ok: false, error: "Order tidak ditemukan." }, { status: 404 });

    const [{ data: item, error: itemError }, { data: supplier, error: supplierError }] = await Promise.all([
      admin.from("order_items").select("input_data, product_name, unit_price").eq("order_id", order.id).maybeSingle(),
      admin
        .from("supplier_orders")
        .select("id, supplier_order_id, status, request_payload, response_payload, error_message, updated_at")
        .eq("order_id", order.id)
        .eq("supplier", "smscode")
        .maybeSingle(),
    ]);
    if (itemError) throw itemError;
    if (supplierError) throw supplierError;

    let input = record(item?.input_data);
    let supplierPayload = record(supplier?.response_payload);
    const requestPayload = record(supplier?.request_payload);

    if (!supplier) {
      return NextResponse.json({ ok: false, error: "Tracking SMSCode belum tersedia." }, { status: 409 });
    }

    if (!supplier.supplier_order_id && Boolean(requestPayload.reconciliationRequired || supplierPayload.reconciliationRequired)) {
      const attempts = Math.max(0, int(supplierPayload.reconcileAttempts));
      const lastAt = Date.parse(String(supplierPayload.lastReconcileAt || ""));
      const canRetry = attempts < 3 && (!Number.isFinite(lastAt) || Date.now() - lastAt >= 5_000);

      if (canRetry) {
        const nextAttempt = attempts + 1;
        try {
          const providerOrder = await createSmscodeProviderOrder({
            catalogProductId: int(requestPayload.catalogProductId),
            maxPrice: Math.max(1, int(requestPayload.quotedProviderPrice)),
            idempotencyKey: String(requestPayload.providerIdempotencyKey || ""),
          });
          const now = new Date().toISOString();
          const actualProviderPrice = Math.max(0, int(providerOrder.amount, int(requestPayload.quotedProviderPrice)));
          supplierPayload = {
            ...supplierPayload,
            ...providerOrder,
            actual_provider_price: actualProviderPrice,
            reconciliationRequired: false,
            reconcileAttempts: nextAttempt,
            reconciledAt: now,
          };
          await admin
            .from("supplier_orders")
            .update({
              supplier_order_id: String(providerOrder.id),
              status: "processing",
              cost_amount: actualProviderPrice,
              error_message: null,
              response_payload: supplierPayload,
              request_payload: { ...requestPayload, reconciliationRequired: false },
              updated_at: now,
            })
            .eq("id", supplier.id);
          input = {
            ...input,
            reconciliationRequired: false,
            phone: String(providerOrder.phone_number || ""),
            activationId: String(providerOrder.id),
            expiresAt: String(providerOrder.expires_at || ""),
            actualProviderPrice,
          };
          await admin.from("order_items").update({ input_data: input }).eq("order_id", order.id);
          await admin.rpc("service_set_order_status", {
            p_order_ref: order.order_code,
            p_status: "accepted",
            p_error: null,
          });
          supplier.supplier_order_id = String(providerOrder.id);
        } catch (error) {
          const now = new Date().toISOString();
          const code = smscodeOrderErrorCode(error);
          const message = error instanceof Error ? error.message : "Rekonsiliasi SMSCode gagal.";
          if (isAmbiguousSmscodeOrderError(error)) {
            supplierPayload = {
              ...supplierPayload,
              error: message,
              errorCode: code,
              reconciliationRequired: true,
              reconcileAttempts: nextAttempt,
              lastReconcileAt: now,
              manualReviewRequired: nextAttempt >= 3,
            };
            await admin
              .from("supplier_orders")
              .update({ response_payload: supplierPayload, error_message: message, updated_at: now })
              .eq("id", supplier.id);
          } else {
            await admin
              .from("supplier_orders")
              .update({
                status: "failed",
                error_message: message,
                response_payload: {
                  ...supplierPayload,
                  error: message,
                  errorCode: code,
                  reconciliationRequired: false,
                  reconcileAttempts: nextAttempt,
                },
                updated_at: now,
              })
              .eq("id", supplier.id);
            const newBalance = await refundIfPaid(
              admin,
              order,
              `${message} SMSCode memastikan order gagal. Saldo dikembalikan otomatis.`,
            );
            return NextResponse.json({
              ok: false,
              status: "failed",
              error: `${message} Saldo sudah dikembalikan.`,
              ...(typeof newBalance === "number" ? { newBalance } : {}),
            });
          }
        }
      }
    }

    if (supplier.supplier_order_id) {
      try {
        const providerOrder = await getSmscodeProviderOrder(supplier.supplier_order_id);
        const now = new Date().toISOString();
        const providerStatus = String(providerOrder.status || "").toUpperCase();
        const otpCode = String(providerOrder.otp_code || "").trim();
        supplierPayload = { ...supplierPayload, ...providerOrder };

        if (otpCode) {
          input = {
            ...input,
            reconciliationRequired: false,
            phone: String(providerOrder.phone_number || input.phone || ""),
            activationId: String(providerOrder.id),
            otpCode,
            sms: otpCode,
            expiresAt: String(providerOrder.expires_at || input.expiresAt || ""),
          };
          await Promise.all([
            admin
              .from("supplier_orders")
              .update({ status: "success", response_payload: supplierPayload, error_message: null, updated_at: now })
              .eq("id", supplier.id),
            admin.from("order_items").update({ input_data: input }).eq("order_id", order.id),
            admin.rpc("service_set_order_status", {
              p_order_ref: order.order_code,
              p_status: "completed",
              p_error: null,
            }),
          ]);
          void finishSmscodeProviderOrder(providerOrder.id).catch(() => undefined);
          order.status = "completed";
        } else if (["CANCELED", "CANCELLED", "EXPIRED", "FAILED"].includes(providerStatus)) {
          await admin
            .from("supplier_orders")
            .update({
              status: providerStatus === "FAILED" ? "failed" : "cancelled",
              response_payload: supplierPayload,
              updated_at: now,
            })
            .eq("id", supplier.id);
          const newBalance = await refundIfPaid(
            admin,
            order,
            `Order SMSCode berstatus ${providerStatus}. Saldo dikembalikan otomatis.`,
          );
          order.status = "refunded";
          return NextResponse.json({
            ok: true,
            orderId: order.order_code,
            productName: String(item?.product_name || "Nomor OTP"),
            price: Number(item?.unit_price || 0),
            ...customerPayload(input, supplierPayload, order.status),
            ...(typeof newBalance === "number" ? { newBalance } : {}),
            message: "Order tidak aktif lagi. Saldo sudah dikembalikan.",
          });
        } else {
          input = {
            ...input,
            phone: String(providerOrder.phone_number || input.phone || ""),
            activationId: String(providerOrder.id),
            expiresAt: String(providerOrder.expires_at || input.expiresAt || ""),
          };
          await Promise.all([
            admin
              .from("supplier_orders")
              .update({ status: "processing", response_payload: supplierPayload, error_message: null, updated_at: now })
              .eq("id", supplier.id),
            admin.from("order_items").update({ input_data: input }).eq("order_id", order.id),
          ]);
          if (["paid", "pending_payment"].includes(String(order.status))) {
            await admin.rpc("service_set_order_status", {
              p_order_ref: order.order_code,
              p_status: "accepted",
              p_error: null,
            });
            order.status = "accepted";
          }
        }
      } catch (error) {
        console.error("[smscode] status provider gagal", {
          orderCode: order.order_code,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const payload = customerPayload(input, supplierPayload, String(order.status));
    return NextResponse.json(
      {
        ok: true,
        orderId: order.order_code,
        productName: String(item?.product_name || "Nomor OTP"),
        price: Number(item?.unit_price || 0),
        createdAt: order.created_at,
        ...payload,
        reviewRequired: Boolean(requestPayload.reconciliationRequired || supplierPayload.reconciliationRequired),
        manualReviewRequired: Boolean(supplierPayload.manualReviewRequired),
        reviewMessage: String(supplierPayload.reviewMessage || input.reviewMessage || ""),
        refreshAfterMs: payload.status === "accepted" ? 5_000 : 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Status SMSCode gagal dibaca." },
      { status: 500 },
    );
  }
}
