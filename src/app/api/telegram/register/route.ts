import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RegistrationPayload = {
  name?: unknown;
  telegram?: unknown;
  whatsapp?: unknown;
  company?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  let body: RegistrationPayload;

  try {
    body = (await request.json()) as RegistrationPayload;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Data pendaftaran tidak valid." },
      { status: 400 },
    );
  }

  // Honeypot sederhana untuk bot spam.
  if (cleanText(body.company, 100)) {
    return NextResponse.json({ ok: true });
  }

  const name = cleanText(body.name, 80);
  const whatsapp = cleanText(body.whatsapp, 40);

  if (!name || !whatsapp) {
    return NextResponse.json(
      { ok: false, message: "Nama dan WhatsApp wajib diisi." },
      { status: 400 },
    );
  }

  // Endpoint dipertahankan untuk kompatibilitas versi lama.
  // Tidak ada lagi pengiriman data ke Telegram Bot.
  return NextResponse.json({
    ok: true,
    message: "Data profil valid.",
  });
}
