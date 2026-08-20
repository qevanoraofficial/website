import { NextRequest, NextResponse } from "next/server";
import {
  cancelSmscodeProviderOrder,
  getSmscodeProviderOrder,
  SmscodeOrderApiError,
} from "@/lib/smscode-orders";
import { assertSameOrigin } from "@/lib/order-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
      .select("id, order_code, status, payment_status, payment_method")
      .eq("order_code", orderCode)
      .eq("user_id", userData.user.id)
      .eq("supplier", "smscode")
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return NextResponse.json({ ok: false, error: "Order tidak ditemukan." }, { status: 404 });
    if (!["paid", "processing", "accepted"].includes(String(order.status))) {
      return NextResponse.json({ ok: false, error: "Order ini sudah tidak dapat dibatalkan." }, { status: 409 });
    }

    const { data: supplier, error: supplierError } = await admin
      .from("supplier_orders")
      .select("id, supplier_order_id, response_payload")
      .eq("order_id", order.id)
      .eq("supplier", "smscode")
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier?.supplier_order_id) {
      return NextResponse.json(
        {
          ok: false,
          code: "SMSCODE_RECONCILING",
          error: "Order masih diverifikasi ke SMSCode. Pembatalan belum aman dilakukan.",
        },
        { status: 409 },
      );
    }

    const current = await getSmscodeProviderOrder(supplier.supplier_order_id);
    if (String(current.otp_code || "").trim()) {
      return NextResponse.json(
        { ok: false, error: "OTP sudah diterima sehingga order tidak dapat dibatalkan." },
        { status: 409 },
      );
    }

    const providerStatus = String(current.status || "").toUpperCase();
    if (["CANCELED", "CANCELLED", "EXPIRED"].includes(providerStatus)) {
      const { data: refundData, error: refundError } = await admin.rpc("refund_order_to_wallet", {
        p_order_id: order.id,
        p_reason: "Order SMSCode sudah dibatalkan/expired. Saldo dikembalikan otomatis.",
      });
      if (refundError && !String(refundError.message || "").includes("order_not_paid")) throw refundError;
      const refund = Array.isArray(refundData) ? refundData[0] : refundData;
      return NextResponse.json({
        ok: true,
        message: "Order sudah tidak aktif. Saldo QEVANORA sudah dikembalikan.",
        newBalance: Number(refund?.new_balance || 0),
      });
    }

    try {
      const cancelled = await cancelSmscodeProviderOrder(supplier.supplier_order_id);
      await admin
        .from("supplier_orders")
        .update({
          status: "cancelled",
          response_payload: {
            ...(supplier.response_payload && typeof supplier.response_payload === "object"
              ? supplier.response_payload
              : {}),
            ...current,
            cancel_response: cancelled,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", supplier.id);

      const { data: refundData, error: refundError } = await admin.rpc("refund_order_to_wallet", {
        p_order_id: order.id,
        p_reason: "Nomor SMSCode dibatalkan oleh customer. Saldo dikembalikan otomatis.",
      });
      if (refundError) throw refundError;
      const refund = Array.isArray(refundData) ? refundData[0] : refundData;

      return NextResponse.json({
        ok: true,
        message: "Order dibatalkan. Saldo QEVANORA sudah dikembalikan.",
        newBalance: Number(refund?.new_balance || 0),
      });
    } catch (error) {
      if (error instanceof SmscodeOrderApiError && error.code === "CANCEL_TOO_EARLY") {
        return NextResponse.json(
          {
            ok: false,
            code: "CANCEL_TOO_EARLY",
            error: "Nomor masih terlalu baru untuk dibatalkan. SMSCode biasanya mengizinkan cancel setelah sekitar 2 menit.",
          },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Order gagal dibatalkan." },
      { status: 500 },
    );
  }
}
