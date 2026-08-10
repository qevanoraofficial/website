import { NextResponse } from "next/server";
import { requireBotAuthorization } from "@/lib/bot-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapOrderForBot } from "@/lib/supabase/order-mapper";
import { syncRecentFollowOrders } from "@/lib/follow-order-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "API secret WebTools tidak valid." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  try {
    requireBotAuthorization(request);
    const admin = createAdminClient();
    await syncRecentFollowOrders(admin).catch((error) => {
      console.error("[follow] sinkron status bot gagal", error);
    });

    const { data: orderRows, error } = await admin
      .from("orders")
      .select(
        "id, order_code, user_id, status, supplier, created_at, updated_at, cancel_reason, customer_data, order_items(supplier_product_id, product_name, unit_price, input_data)"
      )
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const userIds = Array.from(
      new Set((orderRows || []).map((row) => row.user_id).filter(Boolean))
    );

    const profileMap = new Map<
      string,
      { display_name?: string | null; phone?: string | null; telegram_id?: string | null }
    >();

    if (userIds.length) {
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("user_id, display_name, phone, telegram_id")
        .in("user_id", userIds);

      if (profileError) throw profileError;
      for (const profile of profiles || []) {
        profileMap.set(profile.user_id, profile);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        orders: (orderRows || []).map((row) =>
          mapOrderForBot(row, profileMap.get(row.user_id))
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BOT_UNAUTHORIZED") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Daftar order gagal dibaca.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  try {
    requireBotAuthorization(request);
    const body = (await request.json()) as {
      orderId?: unknown;
      status?: unknown;
      error?: unknown;
    };
    const orderId = String(body.orderId || "").trim().slice(0, 120);
    const status = String(body.status || "").trim();

    if (!orderId || !["accepted", "completed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Order ID atau status tidak valid." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const reason = String(body.error || "").trim().slice(0, 500);

    let orderQuery = admin
      .from("orders")
      .select("id, order_code, status, payment_status, payment_method, supplier, updated_at");

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);
    orderQuery = isUuid ? orderQuery.eq("id", orderId) : orderQuery.eq("order_code", orderId);
    const { data: existingOrder, error: lookupError } = await orderQuery.maybeSingle();

    if (lookupError) throw lookupError;
    if (!existingOrder) {
      return NextResponse.json(
        { ok: false, error: "Order tidak ditemukan." },
        { status: 404 }
      );
    }

    if (existingOrder.supplier === "follow") {
      return NextResponse.json(
        { ok: false, error: "Order Follow.co.id dikendalikan otomatis oleh status supplier." },
        { status: 409 }
      );
    }

    if (
      status === "cancelled" &&
      existingOrder.payment_status === "paid" &&
      existingOrder.payment_method === "wallet"
    ) {
      const { data: refundData, error: refundError } = await admin.rpc(
        "refund_order_to_wallet",
        {
          p_order_id: existingOrder.id,
          p_reason: reason || "Order dibatalkan admin.",
        }
      );

      if (refundError) throw refundError;
      const refund = Array.isArray(refundData) ? refundData[0] : refundData;

      return NextResponse.json({
        ok: true,
        refunded: true,
        newBalance: Number(refund?.new_balance || 0),
        order: {
          id: existingOrder.order_code || orderId,
          status: "cancelled",
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const { data, error } = await admin.rpc("service_set_order_status", {
      p_order_ref: orderId,
      p_status: status,
      p_error: reason,
    });

    if (error) {
      const message = error.message || "";
      if (message.includes("order_not_found")) {
        return NextResponse.json(
          { ok: false, error: "Order tidak ditemukan." },
          { status: 404 }
        );
      }
      if (message.includes("order_status_locked")) {
        return NextResponse.json(
          { ok: false, error: "Status order sudah final dan tidak dapat diubah." },
          { status: 409 }
        );
      }
      throw error;
    }

    const updated = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      order: {
        id: updated?.order_code || orderId,
        status,
        updatedAt: updated?.updated_at || new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BOT_UNAUTHORIZED") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Status order gagal diperbarui.",
      },
      { status: 500 }
    );
  }
}
