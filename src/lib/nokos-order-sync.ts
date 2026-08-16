import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finishNokosActivation, getNokosActivationStatus } from "@/lib/nokos";

type AdminClient = SupabaseClient;

const NOKOS_SYNC_INTERVAL_MS = 5_000;

type SupplierRow = {
  id: string;
  order_id: string;
  supplier_order_id: string | null;
  status: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
};

async function refund(admin: AdminClient, order: OrderRow, reason: string) {
  if (order.payment_method !== "wallet" || order.payment_status !== "paid") return;
  await admin.rpc("refund_order_to_wallet", {
    p_order_id: order.id,
    p_reason: reason,
  });
}

async function syncOne(admin: AdminClient, supplier: SupplierRow, order: OrderRow) {
  if (!supplier.supplier_order_id) return;
  const data = await getNokosActivationStatus(supplier.supplier_order_id);
  const status = String(data.status || "").trim().toUpperCase();
  const mergedPayload = { ...(supplier.response_payload || {}), ...data };
  const updatedAt = new Date().toISOString();

  if (status === "STATUS_OK" || status === "RECEIVED") {
    await admin
      .from("supplier_orders")
      .update({ status: "success", response_payload: mergedPayload, updated_at: updatedAt })
      .eq("id", supplier.id);

    const { error: itemError } = await admin
      .from("order_items")
      .update({
        input_data: {
          ...(supplier.request_payload || {}),
          phone: String(mergedPayload.phone || ""),
          activationId: supplier.supplier_order_id,
          otpCode: String(data.code || ""),
          sms: String(data.sms || ""),
          expiresAt: String(mergedPayload.expires_at || ""),
          categoryName: "Nokos",
        },
      })
      .eq("order_id", order.id);
    if (itemError) throw itemError;

    if (!["completed", "refunded", "cancelled", "failed"].includes(order.status)) {
      await admin.rpc("service_set_order_status", {
        p_order_ref: order.order_code,
        p_status: "completed",
        p_error: null,
      });
    }

    void finishNokosActivation(supplier.supplier_order_id).catch(() => undefined);
    return;
  }

  if (["STATUS_CANCEL", "STATUS_CANCELLED", "CANCELLED", "CANCELED", "EXPIRED"].includes(status)) {
    await admin
      .from("supplier_orders")
      .update({ status: "cancelled", response_payload: mergedPayload, updated_at: updatedAt })
      .eq("id", supplier.id);
    await refund(admin, order, "Aktivasi nomor dibatalkan. Saldo dikembalikan otomatis.");
    return;
  }

  await admin
    .from("supplier_orders")
    .update({ status: "processing", response_payload: mergedPayload, updated_at: updatedAt })
    .eq("id", supplier.id);

  if (order.status === "paid" || order.status === "pending_payment") {
    await admin.rpc("service_set_order_status", {
      p_order_ref: order.order_code,
      p_status: "accepted",
      p_error: null,
    });
  }
}

export async function syncNokosOrdersForUser(admin: AdminClient, userId: string) {
  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, user_id, status, payment_status, payment_method")
    .eq("user_id", userId)
    .eq("supplier", "nokos")
    .in("status", ["paid", "processing", "accepted"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (orderError) throw orderError;
  if (!orders?.length) return;

  const orderMap = new Map((orders as OrderRow[]).map((order) => [order.id, order]));
  const { data: suppliers, error: supplierError } = await admin
    .from("supplier_orders")
    .select("id, order_id, supplier_order_id, status, request_payload, response_payload, updated_at")
    .eq("supplier", "nokos")
    .in("status", ["pending", "processing"])
    .in("order_id", Array.from(orderMap.keys()));
  if (supplierError) throw supplierError;

  for (const supplier of (suppliers || []) as SupplierRow[]) {
    const lastUpdate = supplier.updated_at ? new Date(supplier.updated_at).getTime() : 0;
    if (lastUpdate && Date.now() - lastUpdate < NOKOS_SYNC_INTERVAL_MS) continue;
    const order = orderMap.get(supplier.order_id);
    if (!order) continue;
    try {
      await syncOne(admin, supplier, order);
    } catch (error) {
      console.error(`[nokos] sync ${supplier.supplier_order_id || supplier.id} gagal`, error);
    }
  }
}

export async function syncRecentNokosOrders(admin: AdminClient) {
  const { data: suppliers, error: supplierError } = await admin
    .from("supplier_orders")
    .select("id, order_id, supplier_order_id, status, request_payload, response_payload, updated_at")
    .eq("supplier", "nokos")
    .in("status", ["pending", "processing"])
    .order("updated_at", { ascending: true })
    .limit(20);
  if (supplierError) throw supplierError;
  if (!suppliers?.length) return;

  const ids = Array.from(new Set((suppliers as SupplierRow[]).map((row) => row.order_id)));
  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, user_id, status, payment_status, payment_method")
    .in("id", ids);
  if (orderError) throw orderError;
  const orderMap = new Map(((orders || []) as OrderRow[]).map((order) => [order.id, order]));

  for (const supplier of suppliers as SupplierRow[]) {
    const lastUpdate = supplier.updated_at ? new Date(supplier.updated_at).getTime() : 0;
    if (lastUpdate && Date.now() - lastUpdate < NOKOS_SYNC_INTERVAL_MS) continue;
    const order = orderMap.get(supplier.order_id);
    if (!order) continue;
    try {
      await syncOne(admin, supplier, order);
    } catch (error) {
      console.error(`[nokos] sync ${supplier.supplier_order_id || supplier.id} gagal`, error);
    }
  }
}
