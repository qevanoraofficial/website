import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import {
  followServiceToProduct,
  getFollowServices,
  isFollowConfigured,
} from "@/lib/follow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInt(value: unknown, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifyAdminSessionToken(session)) {
    return noStore({ ok: false, error: "Admin session diperlukan." }, 403);
  }

  if (!isFollowConfigured()) {
    return noStore(
      {
        ok: false,
        configured: false,
        error: "Follow.co.id belum dikonfigurasi.",
      },
      503,
    );
  }

  const params = request.nextUrl.searchParams;
  const search = String(params.get("search") || "").trim().toLowerCase();
  const serviceQuery = String(params.get("service") || "").trim();

  try {
    const result = await getFollowServices({ force: true });
    const markupPercent = Math.max(
      0,
      number(process.env.FOLLOW_MARKUP_PERCENT, 0),
    );
    const usdIdrRate = Math.max(
      1,
      number(process.env.FOLLOW_USD_IDR_RATE, 17000),
    );

    let services = result.services;

    if (serviceQuery) {
      services = services.filter(
        (service) => String(service.service) === serviceQuery,
      );
    } else if (search) {
      services = services.filter((service) =>
        `${service.name || ""} ${service.category || ""} ${service.type || ""}`
          .toLowerCase()
          .includes(search),
      );
    }

    const products = services.map((service) => {
      const product = followServiceToProduct(service, result.currency);

      const providerRateRaw = Math.max(0, number(service.rate));
      const providerRateIdr =
        result.currency === "USD"
          ? providerRateRaw * usdIdrRate
          : providerRateRaw;

      const sellingRatePer1000 = Math.max(
        1,
        Math.round(Number(product.ratePer1000 || product.price) || 0),
      );

      const providerRatePer1000 = Math.max(
        0,
        Math.round(providerRateIdr),
      );

      const profitPer1000 = Math.max(
        0,
        sellingRatePer1000 - providerRatePer1000,
      );

      const min = positiveInt(service.min, 1);
      const max = Math.max(min, positiveInt(service.max, min));

      const providerCostAtMin = Math.max(
        0,
        Math.ceil((providerRateIdr * min) / 1000),
      );
      const sellingPriceAtMin = Math.max(
        1,
        Math.ceil((sellingRatePer1000 * min) / 1000),
      );

      return {
        service: {
          id: String(service.service),
          name: String(service.name || ""),
          category: String(service.category || ""),
          type: String(service.type || ""),
        },
        provider: {
          rawRate: providerRateRaw,
          currency: result.currency,
          ratePer1000Idr: providerRatePer1000,
          usdIdrRate:
            result.currency === "USD" ? usdIdrRate : null,
        },
        markupPercent,
        profitPer1000,
        sellingRatePer1000,
        min,
        max,
        minimumOrder: {
          quantity: min,
          estimatedProviderCost: providerCostAtMin,
          sellingPrice: sellingPriceAtMin,
          estimatedProfit: Math.max(
            0,
            sellingPriceAtMin - providerCostAtMin,
          ),
        },
        refill: Boolean(product.refill),
        cancel: Boolean(product.cancel),
      };
    });

    products.sort(
      (a, b) =>
        a.sellingRatePer1000 - b.sellingRatePer1000 ||
        a.service.name.localeCompare(b.service.name, "id-ID"),
    );

    const totalProviderRatePer1000 = products.reduce(
      (sum, item) => sum + item.provider.ratePer1000Idr,
      0,
    );
    const totalSellingRatePer1000 = products.reduce(
      (sum, item) => sum + item.sellingRatePer1000,
      0,
    );

    return noStore({
      ok: true,
      configured: true,
      checkedAt: new Date().toISOString(),
      provider: "follow.co.id",
      rateCurrency: result.currency,
      currencySource: result.currencySource,
      markupPercent,
      usdIdrRate:
        result.currency === "USD" ? usdIdrRate : null,
      totalServices: products.length,
      search: search || null,
      service: serviceQuery || null,
      summary: {
        totalProviderRatePer1000,
        totalSellingRatePer1000,
        totalProfitPer1000: Math.max(
          0,
          totalSellingRatePer1000 - totalProviderRatePer1000,
        ),
      },
      products,
    });
  } catch (error) {
    return noStore(
      {
        ok: false,
        configured: true,
        provider: "follow.co.id",
        error:
          error instanceof Error
            ? error.message
            : "Pemeriksaan harga Follow.co.id gagal.",
      },
      424,
    );
  }
}
