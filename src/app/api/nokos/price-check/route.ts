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
      return noStore(
        {
          ok: false,
          code: "BULK_EXACT_PRICE_CHECK_DISABLED",
          error:
            "Bulk exact price-check dinonaktifkan agar tidak melampaui rate limit provider. Gunakan pengecekan per layanan; katalog customer memverifikasi harga live hanya untuk kartu yang sedang ditampilkan.",
        },
        422,
      );
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
