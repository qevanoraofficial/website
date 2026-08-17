import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import {
  getNokosCatalog,
  getNokosPriceCheck,
  isNokosConfigured,
} from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function safeInt(value: string | null, fallback: number) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(session)) {
    return noStore({ ok: false, error: "Admin session diperlukan." }, 403);
  }

  if (!isNokosConfigured()) {
    return noStore(
      { ok: false, configured: false, error: "Nokos belum dikonfigurasi." },
      503,
    );
  }

  const params = request.nextUrl.searchParams;
  const service = String(params.get("service") || "").trim();
  const all = params.get("all") === "1" || service.toLowerCase() === "all";
  const country = safeInt(params.get("country"), 6);
  const serverParam = params.get("server");
  const server =
    serverParam === "s1" ? "s1" : serverParam === "s2" ? "s2" : "auto";

  try {
    if (all) {
      const search = String(params.get("search") || "").trim().slice(0, 100);

      const first = await getNokosCatalog({
        country,
        server,
        search,
        page: 1,
        limit: 60,
        sort: "name",
      });

      const products = [...first.products];

      for (let page = 2; page <= first.totalPages; page += 1) {
        const next = await getNokosCatalog({
          country,
          server,
          search,
          page,
          limit: 60,
          sort: "name",
        });
        products.push(...next.products);
      }

      const markupPercent = Math.max(
        0,
        Number(process.env.NOKOS_MARKUP_PERCENT || 0) || 0,
      );
      const markupFlat = Math.max(
        0,
        Number(process.env.NOKOS_MARKUP_FLAT || 0) || 0,
      );

      const rows = products.map((product) => {
        const providerPrice = Math.max(
          0,
          Math.round(Number(product.providerRate || 0)),
        );
        const sellingPrice = Math.max(
          0,
          Math.round(Number(product.price || 0)),
        );

        return {
          service: {
            code: String(
              product.nokosServiceCode || product.supplierProductId || "",
            ),
            name: String(product.name || "").replace(
              new RegExp(`\\s*-\\s*${first.country.name}\\s*$`, "i"),
              "",
            ),
          },
          selectedServer:
            product.nokosServer === "s1" ? "s1" : "s2",
          providerPrice,
          markupPercent,
          markupFlat,
          percentageMarkupAmount: Math.ceil(
            providerPrice * (markupPercent / 100),
          ),
          profit: Math.max(0, sellingPrice - providerPrice),
          sellingPrice,
          stock: Math.max(0, Math.trunc(Number(product.stock || 0))),
          safeToSell:
            providerPrice > 0 && Math.trunc(Number(product.stock || 0)) > 0,
        };
      });

      const totalStock = rows.reduce((sum, row) => sum + row.stock, 0);

      return noStore({
        ok: true,
        configured: true,
        checkedAt: new Date().toISOString(),
        mode: "all-services",
        country: {
          id: first.country.id,
          name: first.country.name,
          prefix: first.country.prefix || "",
        },
        server,
        markupPercent,
        markupFlat,
        totalServices: rows.length,
        totalStock,
        search: search || null,
        products: rows,
      });
    }

    if (!service) {
      return noStore(
        {
          ok: false,
          error:
            "Isi ?service=wa untuk satu layanan, atau ?all=1 untuk semua layanan.",
          examples: {
            single:
              "/api/nokos/price-check?service=wa&country=6&server=auto",
            all:
              "/api/nokos/price-check?all=1&country=6&server=auto",
          },
        },
        400,
      );
    }

    const check = await getNokosPriceCheck({ service, country, server });
    return noStore({
      ok: true,
      configured: true,
      checkedAt: new Date().toISOString(),
      mode: "single-service",
      ...check,
    });
  } catch (error) {
    return noStore(
      {
        ok: false,
        configured: true,
        error:
          error instanceof Error
            ? error.message
            : "Pemeriksaan harga Nokos gagal.",
      },
      424,
    );
  }
}
