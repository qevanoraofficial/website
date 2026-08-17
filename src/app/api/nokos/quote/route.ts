import { NextRequest, NextResponse } from "next/server";
import { getNokosLiveQuote, isNokosConfigured } from "@/lib/nokos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  if (!isNokosConfigured()) {
    return noStore({ ok: false, error: "Layanan NOKOS belum dikonfigurasi." }, 424);
  }

  const params = request.nextUrl.searchParams;
  const service = String(params.get("service") || "")
    .trim()
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const country = Math.trunc(Number(params.get("country")));
  const rawServer = params.get("server");
  const server = rawServer === "s1" ? "s1" : rawServer === "s2" ? "s2" : "auto";

  if (!service || !Number.isInteger(country) || country < 0) {
    return noStore({ ok: false, error: "Parameter quote NOKOS tidak valid." }, 400);
  }

  try {
    const quote = await getNokosLiveQuote({
      service,
      country,
      server,
      force: false,
    });
    return noStore({ ok: true, service, country, ...quote });
  } catch (error) {
    return noStore(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Harga live provider sedang tidak tersedia.",
      },
      424,
    );
  }
}
