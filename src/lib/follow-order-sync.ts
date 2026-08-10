import "server-only";
import { getFollowOrderStatus } from "@/lib/follow";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

type SupplierRow = {
  id: string;
  order_id: string;
  supplier_order_id: string | null;
  status: string;
  request_payload?: Record<string, unknown> | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_amount: number | string;
};

function providerStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function fullRefund(admin: AdminClient, order: OrderRow, reason: string) {
  if (order.payment_method !== "wallet" || order.payment_status !== "paid") return;
  await admin.rpc("refund_order_to_wallet", {
    p_order_id: order.id,
    p_reason: reason,
  });
}

async function partialRefund(
  admin: AdminClient,
  order: OrderRow,
  supplier: SupplierRow,
  remains: number,
) {
  if (order.payment_method !== "wallet" || order.payment_status !== "paid") return;
  const quantity = Math.max(1, Math.trunc(Number(supplier.request_payload?.quantity || 0)));
  if (!remains || remains <= 0) return;
  if (remains >= quantity) {
    await fullRefund(admin, order, "Follow.co.id mengembalikan status Partial tanpa jumlah terpenuhi. Saldo dikembalikan.");
    return;
  }

  const total = Math.max(0, Number(order.total_amount || 0));
  const amount = Math.max(1, Math.floor((total * remains) / quantity));
  const key = `follow-partial:${order.id}:${supplier.supplier_order_id}`;

  const { data: existing } = await admin
    .from("refunds")
    .select("id, status")
    .eq("idempotency_key", key)
    .maybeSingle();

  if (!existing) {
    const { data: refundRow, error: refundInsertError } = await admin
      .from("refunds")
      .insert({
        order_id: order.id,
        user_id: order.user_id,
        refund_type: "wallet",
        status: "pending",
        amount,
        reason: `Refund partial Follow.co.id: ${remains} unit tidak terpenuhi.`,
        external_refund_id: supplier.supplier_order_id,
        idempotency_key: key,
        metadata: { supplier: "follow", remains, quantity },
      })
      .select("id")
      .single();
    if (refundInsertError) throw refundInsertError;

    const { error: creditError } = await admin.rpc("wallet_credit", {
      p_user_id: order.user_id,
      p_amount: amount,
      p_transaction_type: "refund",
      p_order_id: order.id,
      p_idempotency_key: key,
      p_reference_id: supplier.supplier_order_id,
      p_metadata: { supplier: "follow", remains, quantity, partial: true },
    });
    if (creditError) throw creditError;

    await admin
      .from("refunds")
      .update({ status: "completed", processed_at: new Date().toISOString() })
      .eq("id", refundRow.id);
  }

  await admin
    .from("orders")
    .update({
      status: "completed",
      payment_status: "partially_refunded",
      completed_at: new Date().toISOString(),
      cancel_reason: `Order Partial: ${remains} unit direfund otomatis ke Saldo QEVANORA.`,
    })
    .eq("id", order.id);
}

async function syncOne(admin: AdminClient, supplier: SupplierRow, order: OrderRow) {
  if (!supplier.supplier_order_id) return;
  const response = await getFollowOrderStatus(supplier.supplier_order_id);
  const status = providerStatus(response.status);
  const baseUpdate = {
    response_payload: response,
    updated_at: new Date().toISOString(),
  };

  if (["completed"].includes(status)) {
    await admin.from("supplier_orders").update({ ...baseUpdate, status: "success" }).eq("id", supplier.id);
    if (!["completed", "refunded", "cancelled", "failed"].includes(order.status)) {
      await admin.rpc("service_set_order_status", {
        p_order_ref: order.order_code,
        p_status: "completed",
        p_error: null,
      });
    }
    return;
  }

  if (["canceled", "cancelled", "fail", "failed"].includes(status)) {
    await admin.from("supplier_orders").update({ ...baseUpdate, status: status.startsWith("cancel") ? "cancelled" : "failed" }).eq("id", supplier.id);
    if (order.payment_status === "paid") {
      await fullRefund(admin, order, `Follow.co.id: ${String(response.status || "Order gagal")}. Saldo dikembalikan otomatis.`);
    }
    return;
  }

  if (status === "partial") {
    const remains = Math.max(0, Math.trunc(Number(response.remains || 0)));
    await partialRefund(admin, order, supplier, remains);
    await admin.from("supplier_orders").update({ ...baseUpdate, status: "success" }).eq("id", supplier.id);
    return;
  }

  await admin.from("supplier_orders").update({ ...baseUpdate, status: "processing" }).eq("id", supplier.id);
  if (order.status === "paid" || order.status === "pending_payment") {
    await admin.rpc("service_set_order_status", {
      p_order_ref: order.order_code,
      p_status: "accepted",
      p_error: null,
    });
  }
}

export async function syncFollowOrdersForUser(admin: AdminClient, userId: string) {
  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, user_id, status, payment_status, payment_method, total_amount")
    .eq("user_id", userId)
    .eq("supplier", "follow")
    .in("status", ["paid", "processing"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (orderError) throw orderError;
  if (!orders?.length) return;

  const orderMap = new Map((orders as OrderRow[]).map((order) => [order.id, order]));
  const { data: suppliers, error: supplierError } = await admin
    .from("supplier_orders")
    .select("id, order_id, supplier_order_id, status, request_payload")
    .eq("supplier", "follow")
    .in("status", ["pending", "processing"])
    .in("order_id", Array.from(orderMap.keys()));
  if (supplierError) throw supplierError;

  for (const supplier of (suppliers || []) as SupplierRow[]) {
    const order = orderMap.get(supplier.order_id);
    if (!order) continue;
    try {
      await syncOne(admin, supplier, order);
    } catch (error) {
      console.error(`[follow] sync ${supplier.supplier_order_id || supplier.id} gagal`, error);
    }
  }
}

export async function syncRecentFollowOrders(admin: AdminClient) {
  const { data: suppliers, error: supplierError } = await admin
    .from("supplier_orders")
    .select("id, order_id, supplier_order_id, status, request_payload")
    .eq("supplier", "follow")
    .in("status", ["pending", "processing"])
    .order("updated_at", { ascending: true })
    .limit(20);
  if (supplierError) throw supplierError;
  if (!suppliers?.length) return;

  const ids = Array.from(new Set((suppliers as SupplierRow[]).map((row) => row.order_id)));
  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, user_id, status, payment_status, payment_method, total_amount")
    .in("id", ids);
  if (orderError) throw orderError;
  const orderMap = new Map(((orders || []) as OrderRow[]).map((order) => [order.id, order]));

  for (const supplier of suppliers as SupplierRow[]) {
    const order = orderMap.get(supplier.order_id);
    if (!order) continue;
    try {
      await syncOne(admin, supplier, order);
    } catch (error) {
      console.error(`[follow] sync ${supplier.supplier_order_id || supplier.id} gagal`, error);
    }
  }
}
