import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/catalog";
import {
  createPendingOrder,
  getStoredOrdersForOwner,
} from "@/lib/github-orders";
import type { StoredOrder } from "@/lib/github-orders";
import {
  assertSameOrigin,
  createOrderOwnerKey,
  createOrderSessionToken,
  readOrderSessionToken,
  setOrderSessionCookie,
} from "@/lib/order-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRequest = {
  productId?: string;
  profile?: {
    name?: string;
    telegram?: string;
    whatsapp?: string;
  };
};

function clean(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

function makeOrderId(): string {
  return `ord_${Date.now().toString(36)}_${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)}`;
}

function jsonResponse(
  payload: Record<string, unknown>,
  status: number,
  sessionToken?: string,
): NextResponse {
  const response = NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });

  if (sessionToken) {
    setOrderSessionCookie(response, sessionToken);
  }

  return response;
}

export async function GET(request: NextRequest) {
  try {
    const token = readOrderSessionToken(request);

    if (!token) {
      return jsonResponse({ ok: true, orders: [] }, 200);
    }

    const ownerKey = createOrderOwnerKey(token);
    const orders = await getStoredOrdersForOwner(ownerKey);

    return jsonResponse(
      {
        ok: true,
        orders: orders.map((order) => ({
          id: order.id,
          productId: order.productId,
          productName: order.productName,
          categoryName: order.categoryName,
          price: order.price,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          error: order.error || "",
        })),
      },
      200,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Status order gagal dibaca.",
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  let sessionToken = readOrderSessionToken(request) || "";

  try {
    assertSameOrigin(request);

    const body = (await request.json()) as OrderRequest;
    const productId = clean(body.productId, 80);
    const customerName = clean(body.profile?.name, 80);
    const telegram = clean(body.profile?.telegram, 80);
    const whatsapp = clean(body.profile?.whatsapp, 40);

    if (!productId || !customerName || !whatsapp) {
      return jsonResponse(
        {
          ok: false,
          error: "Nama, WhatsApp, dan produk wajib diisi.",
        },
        400,
        sessionToken || undefined,
      );
    }

    const product = (await getProducts()).find((item) => item.id === productId);

    if (!product || product.active === false) {
      return jsonResponse(
        { ok: false, error: "Produk tidak ditemukan." },
        404,
        sessionToken || undefined,
      );
    }

    if (Number(product.stock) <= 0) {
      return jsonResponse(
        { ok: false, error: "Stok produk sedang habis." },
        409,
        sessionToken || undefined,
      );
    }

    if (!sessionToken) {
      sessionToken = createOrderSessionToken();
    }

    const ownerKey = createOrderOwnerKey(sessionToken);
    const orderId = makeOrderId();
    const createdAt = new Date().toISOString();

    const order: StoredOrder = {
      id: orderId,
      ownerKey,
      productId: product.id,
      productName: product.name,
      categoryName: product.categoryName,
      price: Number(product.price) || 0,
      customerName,
      whatsapp,
      telegram,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
    };

    // Order disimpan langsung ke GitHub dan selanjutnya dikelola dari WebTools.
    // Telegram Bot tidak lagi menjadi bagian dari proses checkout.
    await createPendingOrder(order);

    return jsonResponse(
      {
        ok: true,
        orderId,
        createdAt,
        status: "pending",
        message: "Order berhasil dibuat dan sedang menunggu konfirmasi admin.",
      },
      201,
      sessionToken,
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
      500,
      sessionToken || undefined,
    );
  }
}
