import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import { getNokosPriceCheck, isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(session)) {
    return noStore({ ok: false, error: "Admin session diperlukan." }, 403);
  }

  if (!isNokosConfigured()) {
    return noStore({ ok: false, configured: false, error: "Nokos belum dikonfigurasi." }, 503);
  }

  const params = request.nextUrl.searchParams;
  const service = String(params.get("service") || "").trim();
  if (!service) {
    return noStore(
      {
        ok: false,
        error: "Parameter service wajib diisi. Contoh: ?service=whatsapp&country=6&server=s2",
      },
      400,
    );
  }

  const countryValue = Number(params.get("country") || 6);
  const country = Number.isFinite(countryValue) ? Math.trunc(countryValue) : 6;
  const server = params.get("server") === "s1" ? "s1" : "s2";

  try {
    const check = await getNokosPriceCheck({ service, country, server });
    return noStore({
      ok: true,
      configured: true,
      checkedAt: new Date().toISOString(),
      ...check,
    });
  } catch (error) {
    return noStore(
      {
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : "Pemeriksaan harga Nokos gagal.",
      },
      424,
    );
  }
}
