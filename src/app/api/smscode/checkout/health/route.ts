import { NextResponse } from "next/server";
import { getKomerceEnvironment } from "@/lib/komerce-payment";
import { isSmscodeCheckoutEnabled } from "@/lib/smscode-orders";
import { isSmscodeConfigured } from "@/lib/smscode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isSmscodeConfigured();
  const checkoutEnabled = isSmscodeCheckoutEnabled();
  const paymentEnvironment = getKomerceEnvironment();
  return NextResponse.json(
    {
      ok: configured,
      configured,
      checkoutEnabled,
      paymentEnvironment,
      readyForPaidCheckout: configured && checkoutEnabled && paymentEnvironment === "production",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
