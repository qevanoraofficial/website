import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/order-session";
import {
  createPremiumAppOrder,
  getPremiumAppProduct,
  parsePremiumAppProductId,
  premiumOrderState,
} from "@/lib/premium-apps";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { productId?: string; quotedPrice?: number };
    const productId = clean(body.productId, 500);
    const quotedPrice = Math.max(0, Math.round(Number(body.quotedPrice) || 0));
    const parsed = parsePremiumAppProductId(productId);
    if (!parsed) return json({ ok: false, error: "Produk Premium Apps tidak valid." }, 400);

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: "Silakan masuk terlebih dahulu." }, 401);
    }

    const [profileResult, walletResult, product] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, phone, telegram_id, status")
        .eq("user_id", userData.user.id)
        .single(),
      supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
      getPremiumAppProduct(productId),
    ]);

    const profile = profileResult.data;
    if (!profile || profile.status !== "active") {
      return json({ ok: false, error: "Akun QEVANORA tidak aktif." }, 403);
    }
    if (!profile.display_name?.trim() || !profile.phone?.trim()) {
      return json({ ok: false, error: "Lengkapi Nama dan WhatsApp pada halaman Profile." }, 400);
    }
    if (!product || product.active === false || Number(product.stock) <= 0) {
      return json({ ok: false, error: "Produk Premium Apps tidak tersedia atau stok sedang kosong." }, 404);
    }

    const price = Math.max(1, Math.round(Number(product.price) || 0));
    if (quotedPrice > 0 && quotedPrice !== price) {
      return json(
        {
          ok: false,
          code: "PRICE_CHANGED",
          currentPrice: price,
          error: `Harga berubah menjadi Rp${new Intl.NumberFormat("id-ID").format(price)}. Silakan konfirmasi harga terbaru.`,
        },
        409,
      );
    }

    const balance = Number(walletResult.data?.balance || 0);
    if (balance < price) {
      return json(
        {
          ok: false,
          error: `Saldo QEVANORA tidak cukup. Saldo kamu Rp${new Intl.NumberFormat("id-ID").format(balance)}.`,
        },
        409,
      );
    }

    const admin = createAdminClient();
    const providerProductId = clean(product.supplierProductId || parsed.providerId, 200);
    const { data: createdData, error: createError } = await admin.rpc("service_create_catalog_order", {
      p_user_id: userData.user.id,
      p_product_id: providerProductId,
      p_product_name: product.name,
      p_category_name: "Premium Apps",
      p_price: price,
      p_customer_data: {
        name: profile.display_name,
        whatsapp: profile.phone,
        telegram: profile.telegram_id || "",
        email: userData.user.email || "",
        provider: "zakzz-premium-apps",
      },
      p_supplier: "alfaprem",
    });
    if (createError) throw createError;

    const created = Array.isArray(createdData) ? createdData[0] : createdData;
    if (!created?.order_id || !created?.order_code) {
      throw new Error("Order QEVANORA gagal dibuat.");
    }

    const requestPayload = {
      categoryName: "Premium Apps",
      provider: "zakzz-premium-apps",
      providerProductId,
      stockAtOrder: product.stock,
    };

    const { error: itemError } = await admin
      .from("order_items")
      .update({ input_data: requestPayload })
      .eq("order_id", created.order_id);
    if (itemError) throw itemError;

    const { data: supplierRow, error: supplierCreateError } = await admin
      .from("supplier_orders")
      .insert({
        order_id: created.order_id,
        supplier: "alfaprem",
        status: "pending",
        cost_amount: Math.max(0, Math.round(Number(product.providerRate || 0))),
        request_payload: requestPayload,
      })
      .select("id")
      .single();

    if (supplierCreateError || !supplierRow?.id) {
      await admin.rpc("service_set_order_status", {
        p_order_ref: created.order_code,
        p_status: "failed",
        p_error: "Tracking Premium Apps gagal dibuat.",
      });
      throw supplierCreateError || new Error("Tracking Premium Apps gagal dibuat.");
    }

    const { data: paymentData, error: paymentError } = await admin.rpc(
      "service_pay_order_with_wallet",
      { p_order_id: created.order_id },
    );

    if (paymentError) {
      await admin
        .from("supplier_orders")
        .update({ status: "failed", error_message: paymentError.message, updated_at: new Date().toISOString() })
        .eq("id", supplierRow.id);
      await admin.rpc("service_set_order_status", {
        p_order_ref: created.order_code,
        p_status: "failed",
        p_error: paymentError.message || "Pembayaran saldo gagal.",
      });
      if ((paymentError.message || "").includes("insufficient_balance")) {
        return json({ ok: false, error: "Saldo QEVANORA tidak cukup untuk membayar order ini." }, 409);
      }
      throw paymentError;
    }

    const paid = Array.isArray(paymentData) ? paymentData[0] : paymentData;
    const paidBalance = Number(paid?.new_balance || 0);

    try {
      const providerOrder = await createPremiumAppOrder(providerProductId);
      const state = premiumOrderState(providerOrder);
      const responsePayload = {
        ...providerOrder.raw,
        provider_order_id: providerOrder.id,
        provider_status: providerOrder.status,
        credentials_text: providerOrder.credentials,
      };

      await admin
        .from("supplier_orders")
        .update({
          supplier_order_id: providerOrder.id,
          status: state === "completed" ? "success" : "processing",
          response_payload: responsePayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", supplierRow.id);

      await admin
        .from("order_items")
        .update({
          input_data: {
            ...requestPayload,
            premiumCredentials: providerOrder.credentials,
            providerOrderId: providerOrder.id,
            providerStatus: providerOrder.status,
          },
        })
        .eq("order_id", created.order_id);

      await admin.rpc("service_set_order_status", {
        p_order_ref: created.order_code,
        p_status: state === "completed" ? "completed" : "accepted",
        p_error: null,
      });

      return json(
        {
          ok: true,
          orderId: created.order_code,
          createdAt: created.created_at,
          status: state === "completed" ? "completed" : "accepted",
          paymentMethod: "wallet",
          newBalance: paidBalance,
          message:
            state === "completed"
              ? `Order ${created.order_code} selesai. Data akun Premium Apps sudah tersedia di Notifikasi.`
              : `Order ${created.order_code} sudah dibayar dan sedang menunggu data akun dari supplier.`,
        },
        201,
      );
    } catch (supplierError) {
      const supplierMessage = supplierError instanceof Error ? supplierError.message : "Supplier Premium Apps gagal menerima order.";
      await admin
        .from("supplier_orders")
        .update({
          status: "failed",
          error_message: supplierMessage,
          response_payload: { error: supplierMessage },
          updated_at: new Date().toISOString(),
        })
        .eq("id", supplierRow.id);

      const { data: refundData, error: refundError } = await admin.rpc("refund_order_to_wallet", {
        p_order_id: created.order_id,
        p_reason: `${supplierMessage} Saldo dikembalikan otomatis.`,
      });
      if (refundError) throw refundError;
      const refund = Array.isArray(refundData) ? refundData[0] : refundData;

      return json(
        {
          ok: false,
          error: `${supplierMessage} Saldo QEVANORA sudah dikembalikan.`,
          orderId: created.order_code,
          newBalance: Number(refund?.new_balance || paidBalance),
        },
        502,
      );
    }
  } catch (error) {
    console.error("[premium-apps] create order gagal", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Order Premium Apps gagal diproses." },
      500,
    );
  }
}
