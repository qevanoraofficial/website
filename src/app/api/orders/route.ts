import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { createFollowOrder, getFollowProduct } from "@/lib/follow";
import { syncFollowOrdersForUser } from "@/lib/follow-order-sync";
import { createNokosActivation, getNokosProduct, parseNokosProductId } from "@/lib/nokos";
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
};

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
        ? await getNokosProduct(productId)
        : regularProducts.find((item) => item.id === productId) || null;

    if (!product || product.active === false) {
      return jsonResponse({ ok: false, error: "Produk tidak ditemukan atau stok sedang kosong." }, 404);
    }

    const isFollow = product.supplier === "follow";
    const isNokos = product.supplier === "nokos";
    const isAutoSupplier = isFollow || isNokos;
    const paymentMethod = isAutoSupplier ? "wallet" : requestedPayment;
    let target = "";
    let quantity = 1;
    let price = Math.max(0, Math.round(Number(product.price) || 0));

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

    const { data, error } = await admin.rpc("service_create_catalog_order", {
      p_user_id: userData.user.id,
      p_product_id: supplierProductId,
      p_product_name: product.name,
      p_category_name: product.categoryName,
      p_price: price,
      p_customer_data: {
        name: profile.display_name,
        whatsapp: profile.phone,
        telegram: profile.telegram_id || "",
        email: userData.user.email || "",
        ...(isFollow ? { target, quantity } : {}),
        ...(isNokos
          ? {
              service: product.nokosServiceCode || supplierProductId,
              country: product.nokosCountryId,
              countryName: product.nokosCountryName,
              server: product.nokosServer,
              operator: requestedOperator,
            }
          : {}),
      },
      p_supplier: supplierName,
    });

    if (error) throw error;

    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.order_code || !created?.order_id) {
      throw new Error("Order Supabase gagal dibuat.");
    }

    if (isFollow || isNokos) {
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

    let newBalance: number | undefined;

    if (paymentMethod === "wallet") {
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
      const requestPayload = {
        categoryName: "Nokos",
        service: parsed.service,
        country: parsed.country,
        countryName: product.nokosCountryName || "",
        server: parsed.server,
        operator: requestedOperator,
      };

      const { data: supplierRow, error: supplierCreateError } = await admin
        .from("supplier_orders")
        .insert({
          order_id: created.order_id,
          supplier: "nokos",
          status: "pending",
          cost_amount: Math.max(0, Math.round(Number(product.providerRate || 0))),
          request_payload: requestPayload,
        })
        .select("id")
        .single();

      if (supplierCreateError) {
        const { data: refundData } = await admin.rpc("refund_order_to_wallet", {
          p_order_id: created.order_id,
          p_reason: "Tracking aktivasi gagal dibuat. Saldo dikembalikan otomatis.",
        });
        const refund = Array.isArray(refundData) ? refundData[0] : refundData;
        return jsonResponse(
          {
            ok: false,
            error: "Aktivasi gagal disiapkan. Saldo sudah dikembalikan.",
            newBalance: Number(refund?.new_balance || newBalance || 0),
          },
          502
        );
      }

      try {
        const activation = await createNokosActivation({
          service: parsed.service,
          country: parsed.country,
          server: parsed.server,
          operator: requestedOperator,
          idempotencyKey: `qevanora-${created.order_code}`,
        });

        await admin
          .from("supplier_orders")
          .update({
            supplier_order_id: activation.activation_id,
            status: "processing",
            cost_amount: Math.max(0, Math.round(Number(activation.price || product.providerRate || 0))),
            response_payload: activation,
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
            },
          })
          .eq("order_id", created.order_id);

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
            phone: activation.phone,
            message: `Nomor untuk order ${created.order_code} berhasil diterbitkan. Cek halaman notifikasi untuk nomor dan OTP.`,
          },
          201
        );
      } catch (supplierError) {
        const supplierMessage = supplierError instanceof Error ? supplierError.message : "Nomor gagal diterbitkan.";
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
