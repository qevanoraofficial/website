import { NextResponse } from "next/server";
import { requireBotAuthorization } from "@/lib/bot-auth";
import {
  getStoredOrders,
  setStoredOrderStatus,
  type StoredOrderStatus,
} from "@/lib/github-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json(
    { ok: false, error: "API secret WebTools tidak valid." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    requireBotAuthorization(request);
    const orders = await getStoredOrders();

    return NextResponse.json(
      { ok: true, orders },
      { headers: { "Cache-Control": "no-store" } },
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
      { status: 500, headers: { "Cache-Control": "no-store" } },
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
    const status = String(body.status || "").trim() as StoredOrderStatus;

    if (!orderId || !["completed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Order ID atau status tidak valid." },
        { status: 400 },
      );
    }

    const order = await setStoredOrderStatus(
      orderId,
      status,
      String(body.error || "").trim().slice(0, 500),
    );

    if (!order) {
      return NextResponse.json(
        { ok: false, error: "Order tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    if (error instanceof Error && error.message === "BOT_UNAUTHORIZED") {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Status order gagal diperbarui.",
      },
      { status: 500 },
    );
  }
}
