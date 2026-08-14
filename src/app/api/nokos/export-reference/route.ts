import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import { getNokosReference, isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET() {
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

  try {
    const reference = await getNokosReference({ force: true });

    return noStore({
      ok: true,
      configured: true,
      checkedAt: new Date().toISOString(),
      totalServices: reference.services.length,
      totalCountries: reference.countries.length,
      services: reference.services,
      countries: reference.countries,
    });
  } catch (error) {
    return noStore(
      {
        ok: false,
        configured: true,
        error:
          error instanceof Error
            ? error.message
            : "Gagal memuat referensi Nokos.",
      },
      424,
    );
  }
}
