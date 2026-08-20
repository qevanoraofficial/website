import { NextResponse } from "next/server";
import { getSmscodeCountries, isSmscodeConfigured } from "@/lib/smscode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSmscodeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Layanan SMSCode belum dikonfigurasi." },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const countries = await getSmscodeCountries();
    return NextResponse.json(
      {
        ok: true,
        countries: countries.map((country) => ({
          id: country.id,
          code: country.code,
          name: country.name,
          dialCode: country.dial_code || "",
          emoji: country.emoji || "🌐",
        })),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Referensi SMSCode gagal dimuat.",
      },
      { status: 424, headers: { "Cache-Control": "no-store" } },
    );
  }
}
