import { NextRequest, NextResponse } from "next/server";
import { cancelNokosActivation, getNokosActivationStatus } from "@/lib/nokos";
import { assertSameOrigin } from "@/lib/order-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderCode: string }> };

export async function POST(request: NextRequest, { params }: Props) {
  try {
    assertSameOrigin(request);
    const { orderCode } = await params;
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, order_code, user_id, status, payment_status, payment_method, supplier")
      .eq("order_code", orderCode)
      .eq("user_id", userData.user.id)
      .eq("supplier", "nokos")
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ ok: false, error: "Order tidak ditemukan." }, { status: 404 });
    if (!["paid", "processing"].includes(String(order.status))) {
      return NextResponse.json({ ok: false, error: "Order ini sudah tidak dapat dibatalkan." }, { status: 409 });
    }

    const { data: supplier, error: supplierError } = await admin
      .from("supplier_orders")
      .select("id, supplier_order_id, status, response_payload")
      .eq("order_id", order.id)
      .eq("supplier", "nokos")
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier?.supplier_order_id) {
      return NextResponse.json({ ok: false, error: "Aktivasi belum tersedia." }, { status: 409 });
    }

    const current = await getNokosActivationStatus(supplier.supplier_order_id);
    if (["STATUS_OK", "RECEIVED"].includes(String(current.status || "").toUpperCase()) || current.code) {
      return NextResponse.json({ ok: false, error: "OTP sudah diterima sehingga order tidak dapat dibatalkan." }, { status: 409 });
    }

    const cancelled = await cancelNokosActivation(supplier.supplier_order_id);
    await admin
      .from("supplier_orders")
      .update({
        status: "cancelled",
        response_payload: { ...(supplier.response_payload || {}), ...current, cancel_response: cancelled },
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplier.id);

    const { data: refundData, error: refundError } = await admin.rpc("refund_order_to_wallet", {
      p_order_id: order.id,
      p_reason: "Aktivasi nomor dibatalkan oleh customer. Saldo dikembalikan otomatis.",
    });
    if (refundError) throw refundError;
    const refund = Array.isArray(refundData) ? refundData[0] : refundData;

    return NextResponse.json({
      ok: true,
      message: "Order dibatalkan. Saldo QEVANORA sudah dikembalikan.",
      newBalance: Number(refund?.new_balance || 0),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Order gagal dibatalkan." },
      { status: 500 },
    );
  }
}
