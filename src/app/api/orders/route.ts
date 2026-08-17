import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { createFollowOrder, getFollowProduct } from "@/lib/follow";
import { syncFollowOrdersForUser } from "@/lib/follow-order-sync";
import {
  createNokosActivation,
  getNokosProduct,
  isAmbiguousNokosError,
  parseNokosProductId,
} from "@/lib/nokos";
import { syncNokosOrdersForUser } from "@/lib/nokos-order-sync";
import { assertSameOrigin } from "@/lib/order-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapOrderForCustomer } from "@/lib/supabase/order-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRequest = {
  productId?: string;
  paymentMethod?: "wallet" | "manual";
  target?: string;
  quantity?: number;
  operator?: string;
  quotedPrice?: number;
  checkoutKey?: string;
  panelPlan?: string;
  panelUsername?: string;
};

const PANEL_PLANS = {
  "panel-4gb": { label: "PANEL 4GB | 1 BULAN", price: 2000 },
  "panel-7gb": { label: "PANEL 7GB | 1 BULAN", price: 5000 },
  "panel-10gb": { label: "PANEL 10GB | 1 BULAN", price: 7000 },
  "panel-unlimited": { label: "PANEL UNLIMITED | 1 BULAN", price: 10000 },
} as const;

type PanelPlanKey = keyof typeof PANEL_PLANS;

function clean(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

function jsonResponse(payload: Record<string, unknown>, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ ok: true, orders: [] }, 200);
    }

    const admin = createAdminClient();
    await Promise.all([
      syncFollowOrdersForUser(admin, userData.user.id).catch((error) => {
        console.error("[follow] sinkron status customer gagal", error);
      }),
      syncNokosOrdersForUser(admin, userData.user.id).catch((error) => {
        console.error("[nokos] sinkron status customer gagal", error);
      }),
    ]);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_code, status, supplier, created_at, updated_at, cancel_reason, order_items(supplier_product_id, product_name, unit_price, input_data), supplier_orders(supplier_order_id, status, response_payload)"
      )
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return jsonResponse(
      {
        ok: true,
        orders: (data || []).map((row) => mapOrderForCustomer(row)),
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Status order gagal dibaca.",
      },
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ ok: false, error: "Silakan masuk ke akun QEVANORA terlebih dahulu." }, 401);
    }

    const body = (await request.json()) as OrderRequest;
    const productId = clean(body.productId, 180);
    const quotedPrice = Math.max(0, Math.round(Number(body.quotedPrice) || 0));
    const checkoutKey = clean(
      request.headers.get("idempotency-key") || body.checkoutKey,
      120,
    );
    const requestedPayment = body.paymentMethod === "wallet" ? "wallet" : "manual";
    const operatorCandidate =
      clean(body.operator, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "") || "any";
    const requestedOperator = new Set([
      "any",
      "telkomsel",
      "indosat",
      "xl",
      "tri",
      "axis",
      "smartfren",
    ]).has(operatorCandidate)
      ? operatorCandidate
      : "any";

    if (!productId) {
      return jsonResponse({ ok: false, error: "Produk wajib dipilih." }, 400);
    }

    const isFollowProduct = productId.startsWith("follow-");
    const isNokosProduct = productId.startsWith("nokos:");

    if (
      isNokosProduct &&
      (!checkoutKey || !/^[A-Za-z0-9._:-]{16,120}$/.test(checkoutKey))
    ) {
      return jsonResponse(
        {
          ok: false,
          code: "CHECKOUT_KEY_REQUIRED",
          error: "Sesi checkout NOKOS tidak valid. Tutup popup lalu buka kembali sebelum mencoba lagi.",
        },
        400,
      );
    }

    const [{ data: profile }, { data: wallet }, regularProducts] = await Promise.all([
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
      isFollowProduct || isNokosProduct ? Promise.resolve([]) : getProducts(),
    ]);

    if (!profile || profile.status !== "active") {
      return jsonResponse({ ok: false, error: "Akun QEVANORA tidak aktif." }, 403);
    }

    if (!profile.display_name?.trim() || !profile.phone?.trim()) {
      return jsonResponse({ ok: false, error: "Lengkapi Nama dan WhatsApp pada halaman Profile." }, 400);
    }

    const product = isFollowProduct
      ? await getFollowProduct(productId)
      : isNokosProduct
        ? await getNokosProduct(productId, { force: true })
        : regularProducts.find((item) => item.id === productId) || null;

    if (!product || product.active === false) {
      return jsonResponse({ ok: false, error: "Produk tidak ditemukan atau stok sedang kosong." }, 404);
    }

    const isFollow = product.supplier === "follow";
    const isNokos = product.supplier === "nokos";
    const isPanelProduct = product.category === "pterodactyl-panel";
    const isAutoSupplier = isFollow || isNokos;
    const paymentMethod = isAutoSupplier ? "wallet" : requestedPayment;
    let target = "";
    let quantity = 1;
    let price = Math.max(0, Math.round(Number(product.price) || 0));
    let panelUsername = "";
    let panelPlanCode = "";
    let panelConfig: (typeof PANEL_PLANS)[PanelPlanKey] | null = null;

    if (isFollow) {
      target = clean(body.target, 1000);
      quantity = Math.trunc(Number(body.quantity));
      const min = Math.max(1, Math.trunc(Number(product.minQuantity || 1)));
      const max = Math.max(min, Math.trunc(Number(product.maxQuantity || product.stock || min)));

      if (!target) {
        return jsonResponse({ ok: false, error: "Link atau username target wajib diisi." }, 400);
      }
      if (!Number.isInteger(quantity) || quantity < min || quantity > max) {
        return jsonResponse(
          { ok: false, error: `Jumlah order harus antara ${min.toLocaleString("id-ID")} sampai ${max.toLocaleString("id-ID")}.` },
          400
        );
      }

      const ratePer1000 = Math.max(1, Number(product.ratePer1000 || product.price) || 1);
      price = Math.max(1, Math.ceil((ratePer1000 * quantity) / 1000));
    } else if (isNokos) {
      if (Number(product.stock) <= 0) {
        return jsonResponse({ ok: false, error: "Stok nomor sedang kosong untuk layanan ini." }, 409);
      }
      if (!parseNokosProductId(product.id)) {
        return jsonResponse({ ok: false, error: "Layanan Nokos tidak valid." }, 400);
      }
      price = Math.max(1, Math.round(Number(product.price) || 0));

      // Proteksi harga checkout Nokos:
      // harga yang dilihat customer harus sama dengan harga server-side saat order dibuat.
      // Jika berubah, hentikan sebelum order/wallet dibuat atau didebit.
      if (quotedPrice > 0 && quotedPrice !== price) {
        return jsonResponse(
          {
            ok: false,
            code: "PRICE_CHANGED",
            currentPrice: price,
            selectedServer: product.nokosServer,
            error: `Harga layanan berubah menjadi Rp${new Intl.NumberFormat("id-ID").format(price)}. Silakan konfirmasi harga terbaru.`,
          },
          409
        );
      }
    } else if (isPanelProduct) {
      if (Number(product.stock) <= 0) {
        return jsonResponse({ ok: false, error: "Stok panel sedang habis." }, 409);
      }

      panelPlanCode = clean(body.panelPlan, 40);
      panelUsername = clean(body.panelUsername, 60);
      panelConfig = PANEL_PLANS[panelPlanCode as PanelPlanKey] || null;

      if (!panelConfig) {
        return jsonResponse({ ok: false, error: "Paket panel tidak valid." }, 400);
      }
      if (!panelUsername) {
        return jsonResponse({ ok: false, error: "Username panel wajib diisi." }, 400);
      }

      // Harga panel wajib mengikuti harga produk yang dikelola dari admin panel.
      price = Math.max(0, Math.round(Number(product.price) || 0));
    } else if (Number(product.stock) <= 0) {
      return jsonResponse({ ok: false, error: "Stok produk sedang habis." }, 409);
    }

    if (paymentMethod === "wallet" && Number(wallet?.balance || 0) < price) {
      return jsonResponse(
        {
          ok: false,
          error: `Saldo QEVANORA tidak cukup. Saldo kamu Rp${new Intl.NumberFormat("id-ID").format(Number(wallet?.balance || 0))}.`,
        },
        409
      );
    }

    const admin = createAdminClient();
    const supplierProductId = isAutoSupplier
      ? String(product.supplierProductId || (isFollow ? productId.replace(/^follow-/, "") : ""))
      : product.id;
    const supplierName = isFollow ? "follow" : isNokos ? "nokos" : "manual";

    const customerData = {
      name: profile.display_name,
      whatsapp: profile.phone,
      telegram: profile.telegram_id || "",
      email: userData.user.email || "",
      ...(isFollow ? { target, quantity } : {}),
      ...(isPanelProduct && panelConfig
        ? { panelUsername, panelPlan: product.name, panelPlanCode }
        : {}),
      ...(isNokos
        ? {
            service: product.nokosServiceCode || supplierProductId,
            country: product.nokosCountryId,
            countryName: product.nokosCountryName,
            server: product.nokosServer,
            operator: requestedOperator,
          }
        : {}),
    };

    let created:
      | { order_id: string; order_code: string; created_at: string }
      | null = null;
    let newBalance: number | undefined;
    let duplicateCheckout = false;

    if (isNokos) {
      const checkoutFingerprint = [
        product.id,
        String(price),
        requestedOperator,
        String(product.nokosServer || ""),
      ].join("|");

      const { data: atomicData, error: atomicError } = await admin.rpc(
        "service_create_nokos_wallet_order_v1",
        {
          p_user_id: userData.user.id,
          p_product_id: supplierProductId,
          p_product_name: product.name,
          p_category_name: product.categoryName,
          p_price: price,
          p_customer_data: customerData,
          p_checkout_key: checkoutKey,
          p_checkout_fingerprint: checkoutFingerprint,
        },
      );

      if (atomicError) {
        const message = atomicError.message || "";
        if (message.includes("insufficient_balance")) {
          return jsonResponse(
            { ok: false, code: "INSUFFICIENT_BALANCE", error: "Saldo QEVANORA tidak cukup untuk membayar order ini." },
            409,
          );
        }
        if (message.includes("checkout_key_conflict")) {
          return jsonResponse(
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
      if (!atomic?.order_id || !atomic?.order_code) throw new Error("Order NOKOS atomic gagal dibuat.");

      created = {
        order_id: String(atomic.order_id),
        order_code: String(atomic.order_code),
        created_at: String(atomic.created_at || new Date().toISOString()),
      };
      newBalance = Number(atomic.new_balance || 0);
      duplicateCheckout = Boolean(atomic.duplicate);

      if (String(atomic.payment_status || "") !== "paid") {
        return jsonResponse(
          {
            ok: false,
            code: "NOKOS_CHECKOUT_FINALIZED",
            retryWithNewCheckoutKey: true,
            orderId: created.order_code,
            newBalance,
            error: "Checkout sebelumnya sudah selesai/dibatalkan. Tekan Beli lagi untuk membuat sesi transaksi baru.",
          },
          409,
        );
      }
    } else {
      const { data, error } = await admin.rpc("service_create_catalog_order", {
        p_user_id: userData.user.id,
        p_product_id: supplierProductId,
        p_product_name: product.name,
        p_category_name: product.categoryName,
        p_price: price,
        p_customer_data: customerData,
        p_supplier: supplierName,
      });
      if (error) throw error;
      const createdRow = Array.isArray(data) ? data[0] : data;
      if (!createdRow?.order_code || !createdRow?.order_id) throw new Error("Order Supabase gagal dibuat.");
      created = {
        order_id: String(createdRow.order_id),
        order_code: String(createdRow.order_code),
        created_at: String(createdRow.created_at || new Date().toISOString()),
      };
    }

    if (!created) throw new Error("Order Supabase gagal dibuat.");

    if (isPanelProduct && panelConfig) {
      const { error: itemError } = await admin
        .from("order_items")
        .update({
          input_data: {
            categoryName: product.categoryName,
            panelUsername,
            panelPlan: product.name,
            panelPlanCode,
          },
        })
        .eq("order_id", created.order_id);
      if (itemError) throw itemError;
    }

    if (isFollow || (isNokos && !duplicateCheckout)) {
      const inputData = isFollow
        ? {
            categoryName: product.categoryName,
            target,
            quantity,
            minQuantity: product.minQuantity,
            maxQuantity: product.maxQuantity,
            ratePer1000: product.ratePer1000 || product.price,
            providerCategory: product.providerCategory || "",
            serviceType: product.serviceType || "",
          }
        : {
            categoryName: "Nokos",
            service: product.nokosServiceCode || supplierProductId,
            country: product.nokosCountryId,
            countryName: product.nokosCountryName || "",
            countryPrefix: product.nokosCountryPrefix || "",
            server: product.nokosServer,
            operator: requestedOperator,
            stockAtOrder: product.stock,
          };
      const { error: itemError } = await admin
        .from("order_items")
        .update({ input_data: inputData })
        .eq("order_id", created.order_id);
      if (itemError) throw itemError;
    }

    if (paymentMethod === "wallet" && !isNokos) {
      const { data: paymentData, error: paymentError } = await admin.rpc(
        "service_pay_order_with_wallet",
        { p_order_id: created.order_id }
      );
      if (paymentError) {
        await admin.rpc("service_set_order_status", {
          p_order_ref: created.order_code,
          p_status: "failed",
          p_error: paymentError.message || "Pembayaran saldo gagal.",
        });
        const message = paymentError.message || "";
        if (message.includes("insufficient_balance")) {
          return jsonResponse({ ok: false, error: "Saldo QEVANORA tidak cukup untuk membayar order ini." }, 409);
        }
        throw paymentError;
      }
      const paid = Array.isArray(paymentData) ? paymentData[0] : paymentData;
      newBalance = Number(paid?.new_balance || 0);
    }

    if (isFollow) {
      const { data: supplierRow, error: supplierCreateError } = await admin
        .from("supplier_orders")
        .insert({
          order_id: created.order_id,
          supplier: "follow",
          status: "pending",
          request_payload: { service: supplierProductId, link: target, quantity },
        })
        .select("id")
        .single();

      if (supplierCreateError) {
        const { data: refundData } = await admin.rpc("refund_order_to_wallet", {
          p_order_id: created.order_id,
          p_reason: "Tracking supplier gagal dibuat. Saldo dikembalikan otomatis.",
        });
        const refund = Array.isArray(refundData) ? refundData[0] : refundData;
        return jsonResponse(
          {
            ok: false,
            error: "Order supplier gagal disiapkan. Saldo sudah dikembalikan.",
            newBalance: Number(refund?.new_balance || newBalance || 0),
          },
          502
        );
      }

      try {
        const followOrder = await createFollowOrder({
          service: supplierProductId,
          link: target,
          quantity,
        });

        await admin
          .from("supplier_orders")
          .update({
            supplier_order_id: followOrder.order,
            status: "processing",
            response_payload: followOrder,
            updated_at: new Date().toISOString(),
          })
          .eq("id", supplierRow.id);

        await admin.rpc("service_set_order_status", {
          p_order_ref: created.order_code,
          p_status: "accepted",
          p_error: null,
        });

        return jsonResponse(
          {
            ok: true,
            orderId: created.order_code,
            createdAt: created.created_at,
            status: "accepted",
            paymentMethod,
            newBalance,
            supplierOrderId: followOrder.order,
            message: `Order ${created.order_code} sudah dibayar dan otomatis dikirim untuk diproses.`,
          },
          201
        );
      } catch (supplierError) {
        const supplierMessage = supplierError instanceof Error ? supplierError.message : "Supplier gagal menerima order.";
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

        return jsonResponse(
          {
            ok: false,
            code: "NOKOS_CHECKOUT_REFUNDED",
            retryWithNewCheckoutKey: true,
            error: `${supplierMessage} Saldo QEVANORA sudah dikembalikan.`,
            orderId: created.order_code,
            newBalance: Number(refund?.new_balance || newBalance || 0),
          },
          502
        );
      }
    }

    if (isNokos) {
      const parsed = parseNokosProductId(product.id);
      if (!parsed) throw new Error("Layanan Nokos tidak valid.");

      const providerIdempotencyKey = `qevanora-${created.order_code}`;
      const quotedProviderPrice = Math.max(
        0,
        Math.round(Number(product.providerRate || 0)),
      );
      const requestPayload = {
        categoryName: "Nokos",
        service: parsed.service,
        country: parsed.country,
        countryName: product.nokosCountryName || "",
        server: parsed.server,
        operator: requestedOperator,
        quotedProviderPrice,
        quotedSellingPrice: price,
        providerIdempotencyKey,
        reconciliationRequired: false,
      };

      const { data: supplierEnsureData, error: supplierCreateError } = await admin.rpc(
        "service_ensure_nokos_supplier_order_v1",
        {
          p_order_id: created.order_id,
          p_cost_amount: quotedProviderPrice,
          p_request_payload: requestPayload,
        },
      );

      if (supplierCreateError) {
        const { data: refundData } = await admin.rpc("refund_order_to_wallet", {
          p_order_id: created.order_id,
          p_reason: "Tracking aktivasi gagal dibuat. Saldo dikembalikan otomatis.",
        });
        const refund = Array.isArray(refundData) ? refundData[0] : refundData;
        return jsonResponse(
          {
            ok: false,
            code: "NOKOS_CHECKOUT_REFUNDED",
            retryWithNewCheckoutKey: true,
            error: "Aktivasi gagal disiapkan. Saldo sudah dikembalikan.",
            orderId: created.order_code,
            newBalance: Number(refund?.new_balance || newBalance || 0),
          },
          502
        );
      }

      const ensured = Array.isArray(supplierEnsureData) ? supplierEnsureData[0] : supplierEnsureData;
      if (!ensured?.supplier_row_id) throw new Error("Tracking supplier NOKOS gagal dibuat.");

      const supplierRow = {
        id: String(ensured.supplier_row_id),
        supplier_order_id: String(ensured.supplier_order_id || ""),
        response_payload:
          ensured.response_payload && typeof ensured.response_payload === "object"
            ? ensured.response_payload
            : {},
      };

      if (supplierRow.supplier_order_id) {
        const { data: existingItem } = await admin
          .from("order_items")
          .select("input_data")
          .eq("order_id", created.order_id)
          .maybeSingle();
        const existingInput =
          existingItem?.input_data && typeof existingItem.input_data === "object"
            ? existingItem.input_data
            : {};

        return jsonResponse(
          {
            ok: true,
            code: "NOKOS_DUPLICATE_CHECKOUT",
            orderId: created.order_code,
            createdAt: created.created_at,
            status: "accepted",
            paymentMethod,
            newBalance,
            phone: String(
              (existingInput as Record<string, unknown>).phone ||
                (supplierRow.response_payload as Record<string, unknown>).phone ||
                "",
            ),
            message: `Request duplikat terdeteksi. Order ${created.order_code} yang sama digunakan kembali; saldo tidak dipotong lagi.`,
          },
          200,
        );
      }

      try {
        const activation = await createNokosActivation({
          service: parsed.service,
          country: parsed.country,
          server: parsed.server,
          operator: requestedOperator,
          idempotencyKey: providerIdempotencyKey,
        });

        const actualProviderPrice = Math.max(
          0,
          Math.round(Number(activation.price || quotedProviderPrice || 0)),
        );
        const providerPriceDrift =
          actualProviderPrice > 0 && quotedProviderPrice > 0
            ? actualProviderPrice - quotedProviderPrice
            : 0;
        const responsePayload = {
          ...activation,
          quoted_provider_price: quotedProviderPrice,
          actual_provider_price: actualProviderPrice,
          provider_price_drift: providerPriceDrift,
          provider_idempotency_key: providerIdempotencyKey,
          reconciliationRequired: false,
        };

        await admin
          .from("supplier_orders")
          .update({
            supplier_order_id: activation.activation_id,
            status: "processing",
            cost_amount: actualProviderPrice,
            response_payload: responsePayload,
            request_payload: requestPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", supplierRow.id);

        await admin
          .from("order_items")
          .update({
            input_data: {
              ...requestPayload,
              phone: activation.phone,
              activationId: activation.activation_id,
              expiresAt: String(activation.expires_at || ""),
              actualProviderPrice,
              providerPriceDrift,
            },
          })
          .eq("order_id", created.order_id);

        await admin.rpc("service_set_order_status", {
          p_order_ref: created.order_code,
          p_status: "accepted",
          p_error: null,
        });

        if (actualProviderPrice > price) {
          console.warn("[nokos] provider price melebihi harga yang dibayar customer", {
            orderCode: created.order_code,
            quotedProviderPrice,
            actualProviderPrice,
            chargedSellingPrice: price,
          });
        }

        return jsonResponse(
          {
            ok: true,
            orderId: created.order_code,
            createdAt: created.created_at,
            status: "accepted",
            paymentMethod,
            newBalance,
            phone: activation.phone,
            message: `Nomor untuk order ${created.order_code} berhasil diterbitkan. Cek halaman notifikasi untuk nomor dan OTP.`,
          },
          201
        );
      } catch (supplierError) {
        const supplierMessage =
          supplierError instanceof Error
            ? supplierError.message
            : "Nomor gagal diterbitkan.";

        if (isAmbiguousNokosError(supplierError)) {
          const reviewMessage =
            "Provider NOKOS belum memberi hasil final. Sistem akan mencoba rekonsiliasi ulang memakai request yang sama. Jangan membuat order ulang sampai status ini selesai.";
          const reviewRequestPayload = {
            ...requestPayload,
            reconciliationRequired: true,
            reviewMessage,
          };
          const updatedAt = new Date().toISOString();

          const { error: reviewSupplierError } = await admin
            .from("supplier_orders")
            .update({
              status: "processing",
              error_message: supplierMessage,
              request_payload: reviewRequestPayload,
              response_payload: {
                error: supplierMessage,
                reconciliationRequired: true,
                manualReviewRequired: false,
                reviewMessage,
                providerIdempotencyKey,
                reconcileAttempts: 0,
              },
              updated_at: updatedAt,
            })
            .eq("id", supplierRow.id);

          if (reviewSupplierError) {
            console.error("[nokos] gagal menandai supplier order untuk rekonsiliasi", {
              orderCode: created.order_code,
              error: reviewSupplierError.message,
            });
          }

          const { error: reviewItemError } = await admin
            .from("order_items")
            .update({ input_data: reviewRequestPayload })
            .eq("order_id", created.order_id);

          if (reviewItemError) {
            console.error("[nokos] gagal menyimpan status rekonsiliasi ke order item", {
              orderCode: created.order_code,
              error: reviewItemError.message,
            });
          }

          return jsonResponse(
            {
              ok: true,
              code: "NOKOS_RECONCILING",
              orderId: created.order_code,
              createdAt: created.created_at,
              status: "pending",
              paymentMethod,
              newBalance,
              message: `Order ${created.order_code} sedang diverifikasi ke provider. Jangan order ulang; saldo tidak dipotong lagi selama rekonsiliasi.`,
            },
            202
          );
        }

        await admin
          .from("supplier_orders")
          .update({
            status: "failed",
            error_message: supplierMessage,
            response_payload: {
              error: supplierMessage,
              reconciliationRequired: false,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", supplierRow.id);

        const { data: refundData, error: refundError } = await admin.rpc(
          "refund_order_to_wallet",
          {
            p_order_id: created.order_id,
            p_reason: `${supplierMessage} Saldo dikembalikan otomatis.`,
          },
        );
        if (refundError) throw refundError;
        const refund = Array.isArray(refundData) ? refundData[0] : refundData;

        return jsonResponse(
          {
            ok: false,
            error: `${supplierMessage} Saldo QEVANORA sudah dikembalikan.`,
            orderId: created.order_code,
            newBalance: Number(refund?.new_balance || newBalance || 0),
          },
          502
        );
      }
    }

    return jsonResponse(
      {
        ok: true,
        orderId: created.order_code,
        createdAt: created.created_at,
        status: "pending",
        paymentMethod,
        ...(typeof newBalance === "number" ? { newBalance } : {}),
        message:
          paymentMethod === "wallet"
            ? `Order ${created.order_code} berhasil dibayar dengan Saldo QEVANORA dan sedang menunggu konfirmasi admin.`
            : `Order ${created.order_code} berhasil dibuat dan sedang menunggu konfirmasi admin.`,
      },
      201
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Order gagal disimpan. Silakan coba kembali.",
      },
      500
    );
  }
}
