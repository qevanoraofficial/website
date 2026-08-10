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

    if (!productId) {
      return jsonResponse({ ok: false, error: "Produk wajib dipilih." }, 400);
    }

    const [{ data: profile }, products] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, phone, telegram_id, status")
        .eq("user_id", userData.user.id)
        .single(),
      getProducts(),
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

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("service_create_catalog_order", {
      p_user_id: userData.user.id,
      p_product_id: product.id,
      p_product_name: product.name,
      p_category_name: product.categoryName,
      p_price: Math.max(0, Math.round(Number(product.price) || 0)),
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
    if (!created?.order_code) {
      throw new Error("Order Supabase gagal dibuat.");
    }

    return jsonResponse(
      {
        ok: true,
        orderId: created.order_code,
        createdAt: created.created_at,
        status: "pending",
        message: "Order berhasil dibuat dan sedang menunggu konfirmasi admin.",
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
