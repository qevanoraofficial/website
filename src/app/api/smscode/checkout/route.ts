import { NextRequest, NextResponse } from "next/server";
import { getKomerceEnvironment } from "@/lib/komerce-payment";
import { assertSameOrigin } from "@/lib/order-session";
import {
  createSmscodeProviderOrder,
  isAmbiguousSmscodeOrderError,
  isSmscodeCheckoutEnabled,
  resolveSmscodeCheckoutProduct,
  smscodeOrderErrorCode,
} from "@/lib/smscode-orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutBody = {
  catalogProductId?: number;
  countryId?: number;
  platformId?: number;
  quotedPrice?: number;
  checkoutKey?: string;
};

function text(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function int(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    if (!isSmscodeCheckoutEnabled()) {
      return json(
        {
          ok: false,
          code: "SMSCODE_CHECKOUT_DISABLED",
          error: "Checkout SMSCode masih dikunci untuk pengujian. Admin perlu mengaktifkannya setelah smoke test selesai.",
        },
        503,
      );
    }

    if (getKomerceEnvironment() !== "production") {
      return json(
        {
          ok: false,
          code: "KOMERCE_SANDBOX_SMSCODE_BLOCKED",
          error: "Checkout OTP live dinonaktifkan selama pembayaran Komerce masih Sandbox.",
        },
        503,
      );
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ ok: false, error: "Silakan masuk ke akun QEVANORA terlebih dahulu." }, 401);
    }

    const body = (await request.json()) as CheckoutBody;
    const catalogProductId = int(body.catalogProductId);
    const countryId = int(body.countryId);
    const platformId = int(body.platformId);
    const quotedPrice = Math.max(0, int(body.quotedPrice));
    const checkoutKey = text(request.headers.get("idempotency-key") || body.checkoutKey, 120);

    if (!catalogProductId || !countryId || !platformId) {
      return json({ ok: false, error: "Layanan SMSCode tidak valid." }, 400);
    }
    if (!checkoutKey || !/^[A-Za-z0-9._:-]{16,120}$/.test(checkoutKey)) {
      return json(
        {
          ok: false,
          code: "CHECKOUT_KEY_REQUIRED",
          error: "Sesi checkout tidak valid. Tutup popup lalu buka kembali.",
        },
        400,
      );
    }

    const [{ data: profile }, { data: wallet }, product] = await Promise.all([
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
      resolveSmscodeCheckoutProduct({ catalogProductId, countryId, platformId }),
    ]);

    if (!profile || profile.status !== "active") {
      return json({ ok: false, error: "Akun QEVANORA tidak aktif." }, 403);
    }
    if (!profile.display_name?.trim() || !profile.phone?.trim()) {
      return json({ ok: false, error: "Lengkapi Nama dan WhatsApp pada halaman Profile." }, 400);
    }
    if (product.stock <= 0 || product.providerPrice <= 0 || product.sellingPrice <= 0) {
      return json({ ok: false, error: "Stok nomor sedang kosong untuk layanan ini." }, 409);
    }
    if (quotedPrice > 0 && quotedPrice !== product.sellingPrice) {
      return json(
        {
          ok: false,
          code: "PRICE_CHANGED",
          currentPrice: product.sellingPrice,
          error: `Harga layanan berubah menjadi Rp${new Intl.NumberFormat("id-ID").format(product.sellingPrice)}. Silakan konfirmasi harga terbaru.`,
        },
        409,
      );
    }
    if (Number(wallet?.balance || 0) < product.sellingPrice) {
      return json(
        {
          ok: false,
          code: "INSUFFICIENT_BALANCE",
          error: `Saldo QEVANORA tidak cukup. Saldo kamu Rp${new Intl.NumberFormat("id-ID").format(Number(wallet?.balance || 0))}.`,
        },
        409,
      );
    }

    const admin = createAdminClient();
    const productName = `${product.serviceName} - ${product.countryName}`;
    const customerData = {
      name: profile.display_name,
      whatsapp: profile.phone,
      telegram: profile.telegram_id || "",
      email: userData.user.email || "",
      service: product.serviceCode,
      serviceName: product.serviceName,
      country: product.countryId,
      countryName: product.countryName,
      catalogProductId: product.catalogProductId,
      platformId: product.platformId,
    };
    const fingerprint = [
      product.catalogProductId,
      product.countryId,
      product.platformId,
      product.sellingPrice,
    ].join("|");

    const { data: atomicData, error: atomicError } = await admin.rpc(
      "service_create_smscode_wallet_order_v1",
      {
        p_user_id: userData.user.id,
        p_product_id: String(product.catalogProductId),
        p_product_name: productName,
        p_category_name: "Nomor OTP",
        p_price: product.sellingPrice,
        p_customer_data: customerData,
        p_checkout_key: checkoutKey,
        p_checkout_fingerprint: fingerprint,
      },
    );

    if (atomicError) {
      const message = String(atomicError.message || "");
      if (message.includes("insufficient_balance")) {
        return json({ ok: false, code: "INSUFFICIENT_BALANCE", error: "Saldo QEVANORA tidak cukup." }, 409);
      }
      if (message.includes("checkout_key_conflict")) {
        return json(
          {
            ok: false,
            code: "CHECKOUT_KEY_CONFLICT",
            retryWithNewCheckoutKey: true,
            error: "Sesi checkout sudah dipakai untuk transaksi berbeda. Silakan ulangi checkout.",
          },
          409,
        );
      }
      throw atomicError;
    }

    const atomic = Array.isArray(atomicData) ? atomicData[0] : atomicData;
    if (!atomic?.order_id || !atomic?.order_code) throw new Error("Order SMSCode gagal dibuat.");
    const orderId = String(atomic.order_id);
    const orderCode = String(atomic.order_code);
    const createdAt = String(atomic.created_at || new Date().toISOString());
    const newBalance = Number(atomic.new_balance || 0);

    if (String(atomic.payment_status || "") !== "paid") {
      return json(
        {
          ok: false,
          code: "SMSCODE_CHECKOUT_FINALIZED",
          retryWithNewCheckoutKey: true,
          orderId: orderCode,
          newBalance,
          error: "Checkout sebelumnya sudah selesai atau dibatalkan. Tekan Beli lagi.",
        },
        409,
      );
    }

    const providerIdempotencyKey = `qev-sms-${orderCode}`.slice(0, 100);
    const requestPayload = {
      categoryName: "Nomor OTP",
      catalogProductId: product.catalogProductId,
      countryId: product.countryId,
      countryName: product.countryName,
      countryCode: product.countryCode,
      platformId: product.platformId,
      serviceCode: product.serviceCode,
      serviceName: product.serviceName,
      quotedProviderPrice: product.providerPrice,
      quotedSellingPrice: product.sellingPrice,
      providerIdempotencyKey,
      reconciliationRequired: false,
    };

    await admin
      .from("order_items")
      .update({ input_data: requestPayload })
      .eq("order_id", orderId);

    const { data: ensureData, error: ensureError } = await admin.rpc(
      "service_ensure_smscode_supplier_order_v1",
      {
        p_order_id: orderId,
        p_cost_amount: product.providerPrice,
        p_request_payload: requestPayload,
      },
    );

    if (ensureError) {
      const { data: refundData } = await admin.rpc("refund_order_to_wallet", {
        p_order_id: orderId,
        p_reason: "Tracking SMSCode gagal dibuat. Saldo dikembalikan otomatis.",
      });
      const refund = Array.isArray(refundData) ? refundData[0] : refundData;
      return json(
        {
          ok: false,
          retryWithNewCheckoutKey: true,
          error: "Order supplier gagal disiapkan. Saldo sudah dikembalikan.",
          orderId: orderCode,
          newBalance: Number(refund?.new_balance || newBalance),
        },
        502,
      );
    }

    const ensured = Array.isArray(ensureData) ? ensureData[0] : ensureData;
    if (!ensured?.supplier_row_id) throw new Error("Tracking supplier SMSCode gagal dibuat.");
    const supplierRowId = String(ensured.supplier_row_id);
    const existingSupplierOrderId = String(ensured.supplier_order_id || "");
    const existingPayload =
      ensured.response_payload && typeof ensured.response_payload === "object"
        ? (ensured.response_payload as Record<string, unknown>)
        : {};

    if (existingSupplierOrderId) {
      return json(
        {
          ok: true,
          code: "SMSCODE_DUPLICATE_CHECKOUT",
          orderId: orderCode,
          createdAt,
          status: "accepted",
          newBalance,
          phone: String(existingPayload.phone_number || existingPayload.phone || ""),
          statusUrl: `/smscode/orders/${encodeURIComponent(orderCode)}`,
          message: `Request duplikat terdeteksi. Order ${orderCode} digunakan kembali; saldo tidak dipotong lagi.`,
        },
        200,
      );
    }

    try {
      const providerOrder = await createSmscodeProviderOrder({
        catalogProductId: product.catalogProductId,
        maxPrice: product.providerPrice,
        idempotencyKey: providerIdempotencyKey,
      });
      const actualProviderPrice = Math.max(0, int(providerOrder.amount, product.providerPrice));
      const phone = String(providerOrder.phone_number || "");
      const now = new Date().toISOString();
      const responsePayload = {
        ...providerOrder,
        quoted_provider_price: product.providerPrice,
        actual_provider_price: actualProviderPrice,
        provider_idempotency_key: providerIdempotencyKey,
        reconciliationRequired: false,
      };

      await admin
        .from("supplier_orders")
        .update({
          supplier_order_id: String(providerOrder.id),
          status: "processing",
          cost_amount: actualProviderPrice,
          request_payload: requestPayload,
          response_payload: responsePayload,
          error_message: null,
          updated_at: now,
        })
        .eq("id", supplierRowId);

      await admin
        .from("order_items")
        .update({
          input_data: {
            ...requestPayload,
            phone,
            activationId: String(providerOrder.id),
            expiresAt: String(providerOrder.expires_at || ""),
            actualProviderPrice,
          },
        })
        .eq("order_id", orderId);

      await admin.rpc("service_set_order_status", {
        p_order_ref: orderCode,
        p_status: "accepted",
        p_error: null,
      });

      return json(
        {
          ok: true,
          orderId: orderCode,
          createdAt,
          status: "accepted",
          newBalance,
          phone,
          statusUrl: `/smscode/orders/${encodeURIComponent(orderCode)}`,
          message: `Nomor untuk order ${orderCode} berhasil diterbitkan. Menunggu OTP.`,
        },
        201,
      );
    } catch (providerError) {
      const providerMessage = providerError instanceof Error ? providerError.message : "SMSCode gagal membuat order.";
      const errorCode = smscodeOrderErrorCode(providerError);
      const now = new Date().toISOString();

      if (isAmbiguousSmscodeOrderError(providerError)) {
        const reviewMessage = "SMSCode belum memberi hasil final. Sistem akan mengulang request yang sama secara idempotent; jangan membuat order baru.";
        await admin
          .from("supplier_orders")
          .update({
            status: "processing",
            error_message: providerMessage,
            request_payload: { ...requestPayload, reconciliationRequired: true },
            response_payload: {
              error: providerMessage,
              errorCode,
              reconciliationRequired: true,
              reconcileAttempts: 0,
              providerIdempotencyKey,
              reviewMessage,
            },
            updated_at: now,
          })
          .eq("id", supplierRowId);
        await admin
          .from("order_items")
          .update({ input_data: { ...requestPayload, reconciliationRequired: true, reviewMessage } })
          .eq("order_id", orderId);

        return json(
          {
            ok: true,
            code: "SMSCODE_RECONCILING",
            orderId: orderCode,
            createdAt,
            status: "pending",
            newBalance,
            statusUrl: `/smscode/orders/${encodeURIComponent(orderCode)}`,
            message: `Order ${orderCode} sedang diverifikasi ke SMSCode. Jangan order ulang.`,
          },
          202,
        );
      }

      await admin
        .from("supplier_orders")
        .update({
          status: "failed",
          error_message: providerMessage,
          response_payload: { error: providerMessage, errorCode, reconciliationRequired: false },
          updated_at: now,
        })
        .eq("id", supplierRowId);

      const { data: refundData, error: refundError } = await admin.rpc("refund_order_to_wallet", {
        p_order_id: orderId,
        p_reason: `${providerMessage} Saldo dikembalikan otomatis.`,
      });
      if (refundError) throw refundError;
      const refund = Array.isArray(refundData) ? refundData[0] : refundData;

      return json(
        {
          ok: false,
          retryWithNewCheckoutKey: true,
          error: `${providerMessage} Saldo QEVANORA sudah dikembalikan.`,
          orderId: orderCode,
          newBalance: Number(refund?.new_balance || newBalance),
        },
        502,
      );
    }
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Checkout SMSCode gagal." },
      500,
    );
  }
}
