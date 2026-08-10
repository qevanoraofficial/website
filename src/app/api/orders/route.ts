import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import { assertSameOrigin } from "@/lib/order-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapOrderForCustomer } from "@/lib/supabase/order-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRequest = {
  productId?: string;
  paymentMethod?: "wallet" | "manual";
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

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_code, status, created_at, updated_at, cancel_reason, order_items(supplier_product_id, product_name, unit_price, input_data)"
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
        error:
          error instanceof Error ? error.message : "Status order gagal dibaca.",
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
      return jsonResponse(
        { ok: false, error: "Silakan masuk ke akun QEVANORA terlebih dahulu." },
        401
      );
    }

    const body = (await request.json()) as OrderRequest;
    const productId = clean(body.productId, 80);
    const paymentMethod = body.paymentMethod === "wallet" ? "wallet" : "manual";

    if (!productId) {
      return jsonResponse({ ok: false, error: "Produk wajib dipilih." }, 400);
    }

    const [{ data: profile }, products, { data: wallet }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, phone, telegram_id, status")
        .eq("user_id", userData.user.id)
        .single(),
      getProducts(),
      supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
    ]);

    if (!profile || profile.status !== "active") {
      return jsonResponse({ ok: false, error: "Akun QEVANORA tidak aktif." }, 403);
    }

    if (!profile.display_name?.trim() || !profile.phone?.trim()) {
      return jsonResponse(
        { ok: false, error: "Lengkapi Nama dan WhatsApp pada halaman Profile." },
        400
      );
    }

    const product = products.find((item) => item.id === productId);

    if (!product || product.active === false) {
      return jsonResponse({ ok: false, error: "Produk tidak ditemukan." }, 404);
    }

    if (Number(product.stock) <= 0) {
      return jsonResponse({ ok: false, error: "Stok produk sedang habis." }, 409);
    }

    const price = Math.max(0, Math.round(Number(product.price) || 0));

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
    const { data, error } = await admin.rpc("service_create_catalog_order", {
      p_user_id: userData.user.id,
      p_product_id: product.id,
      p_product_name: product.name,
      p_category_name: product.categoryName,
      p_price: price,
      p_customer_data: {
        name: profile.display_name,
        whatsapp: profile.phone,
        telegram: profile.telegram_id || "",
        email: userData.user.email || "",
      },
      p_supplier: "manual",
    });

    if (error) throw error;

    const created = Array.isArray(data) ? data[0] : data;
    if (!created?.order_code || !created?.order_id) {
      throw new Error("Order Supabase gagal dibuat.");
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
          return jsonResponse(
            { ok: false, error: "Saldo QEVANORA tidak cukup untuk membayar order ini." },
            409
          );
        }
        throw paymentError;
      }

      const paid = Array.isArray(paymentData) ? paymentData[0] : paymentData;
      newBalance = Number(paid?.new_balance || 0);
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
        error:
          error instanceof Error
            ? error.message
            : "Order gagal disimpan. Silakan coba kembali.",
      },
      500
    );
  }
}
