import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/order-session";
import { getPremiumAppOrder, premiumOrderState } from "@/lib/premium-apps";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  order_code: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
};

type SupplierRow = {
  id: string;
  order_id: string;
  supplier_order_id: string | null;
  status: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: orders, error: orderError } = await admin
      .from("orders")
      .select("id, order_code, status, payment_status, payment_method")
      .eq("user_id", userData.user.id)
      .eq("supplier", "alfaprem")
      .in("status", ["paid", "processing"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (orderError) throw orderError;
    if (!orders?.length) return NextResponse.json({ ok: true, synced: 0 });

    const orderMap = new Map((orders as OrderRow[]).map((order) => [order.id, order]));
    const { data: suppliers, error: supplierError } = await admin
      .from("supplier_orders")
      .select("id, order_id, supplier_order_id, status, request_payload, response_payload, updated_at")
      .eq("supplier", "alfaprem")
      .in("status", ["pending", "processing"])
      .in("order_id", Array.from(orderMap.keys()));
    if (supplierError) throw supplierError;

    let synced = 0;
    for (const supplier of (suppliers || []) as SupplierRow[]) {
      if (!supplier.supplier_order_id) continue;
      const lastUpdate = supplier.updated_at ? new Date(supplier.updated_at).getTime() : 0;
      if (lastUpdate && Date.now() - lastUpdate < 8000) continue;
      const order = orderMap.get(supplier.order_id);
      if (!order) continue;

      try {
        const providerOrder = await getPremiumAppOrder(supplier.supplier_order_id);
        const state = premiumOrderState(providerOrder);
        const responsePayload = {
          ...(supplier.response_payload || {}),
          ...providerOrder.raw,
          provider_order_id: providerOrder.id || supplier.supplier_order_id,
          provider_status: providerOrder.status,
          credentials_text: providerOrder.credentials,
        };
        const updatedAt = new Date().toISOString();

        if (state === "completed") {
          await admin
            .from("supplier_orders")
            .update({ status: "success", response_payload: responsePayload, updated_at: updatedAt })
            .eq("id", supplier.id);

          await admin
            .from("order_items")
            .update({
              input_data: {
                ...(supplier.request_payload || {}),
                premiumCredentials: providerOrder.credentials,
                providerOrderId: supplier.supplier_order_id,
                providerStatus: providerOrder.status,
                categoryName: "Premium Apps",
              },
            })
            .eq("order_id", order.id);

          await admin.rpc("service_set_order_status", {
            p_order_ref: order.order_code,
            p_status: "completed",
            p_error: null,
          });
          synced += 1;
          continue;
        }

        if (state === "failed") {
          await admin
            .from("supplier_orders")
            .update({ status: "failed", response_payload: responsePayload, updated_at: updatedAt })
            .eq("id", supplier.id);

          if (order.payment_method === "wallet" && order.payment_status === "paid") {
            await admin.rpc("refund_order_to_wallet", {
              p_order_id: order.id,
              p_reason: "Supplier Premium Apps membatalkan/gagal memproses order. Saldo dikembalikan otomatis.",
            });
          } else {
            await admin.rpc("service_set_order_status", {
              p_order_ref: order.order_code,
              p_status: "failed",
              p_error: "Supplier Premium Apps gagal memproses order.",
            });
          }
          synced += 1;
          continue;
        }

        await admin
          .from("supplier_orders")
          .update({ status: "processing", response_payload: responsePayload, updated_at: updatedAt })
          .eq("id", supplier.id);
        synced += 1;
      } catch (error) {
        console.error(`[premium-apps] sync ${supplier.supplier_order_id} gagal`, error);
      }
    }

    return NextResponse.json({ ok: true, synced });
  } catch (error) {
    console.error("[premium-apps] sync gagal", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sinkronisasi Premium Apps gagal." },
      { status: 500 },
    );
  }
}
