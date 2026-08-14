import "server-only";
import type { TransactionTestimonial } from "@/types/catalog";

type UploadedImage = {
  bytes: Buffer;
  extension: string;
  contentType: string;
};

type TelegramResponse = {
  ok?: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
};

export type TelegramTestimonialResult = {
  ok: boolean;
  messageId?: number;
  error?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRupiah(value: number | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function getTelegramConfig(): { token: string; channel: string } {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const channel = String(
    process.env.TELEGRAM_TESTIMONIAL_CHANNEL || "@qevanoraofficialchanel",
  ).trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi di Cloudflare.");
  }

  if (!channel) {
    throw new Error("TELEGRAM_TESTIMONIAL_CHANNEL belum dikonfigurasi.");
  }

  return { token, channel };
}

function buildCaption(testimonial: TransactionTestimonial): string {
  return [
    "✅ <b>TRANSAKSI SUKSES</b>",
    "",
    `👤 <b>Nama:</b> ${escapeHtml(testimonial.name)}`,
    `📦 <b>Produk:</b> ${escapeHtml(testimonial.productName)}`,
    `💰 <b>Harga Produk:</b> ${escapeHtml(formatRupiah(testimonial.productPrice))}`,
    `🛒 <b>Jumlah Beli:</b> ${escapeHtml(testimonial.quantity)}`,
    `💳 <b>Pembayaran:</b> ${escapeHtml(testimonial.payment)}`,
    `💵 <b>Total Harga:</b> ${escapeHtml(formatRupiah(testimonial.totalPrice))}`,
    `📅 <b>Tanggal Beli:</b> ${escapeHtml(testimonial.purchaseDate)}`,
    "",
    "🎉 Terima kasih telah order di <b>QEVANORA OFFICIAL</b>.",
    "Trusted • Fast • Professional 🚀",
    "",
    "🌐 https://qevanoraofficial.my.id/testimonials",
  ].join("\n");
}

export async function sendTestimonialToTelegram(
  testimonial: TransactionTestimonial,
  image: UploadedImage,
): Promise<TelegramTestimonialResult> {
  let token = "";

  try {
    const config = getTelegramConfig();
    token = config.token;

    const body = new FormData();
    body.set("chat_id", config.channel);
    body.set("caption", buildCaption(testimonial));
    body.set("parse_mode", "HTML");
    body.set(
      "photo",
      new Blob([new Uint8Array(image.bytes)], { type: image.contentType }),
      `testimonial-${testimonial.id}.${image.extension}`,
    );

    const response = await fetch(
      `https://api.telegram.org/bot${config.token}/sendPhoto`,
      {
        method: "POST",
        body,
      },
    );

    const payload = (await response.json().catch(() => ({}))) as TelegramResponse;

    if (!response.ok || payload.ok !== true) {
      throw new Error(
        payload.description ||
          `Telegram Bot API gagal dengan status HTTP ${response.status}.`,
      );
    }

    return {
      ok: true,
      messageId: Number(payload.result?.message_id) || undefined,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Notifikasi Telegram gagal dikirim.";
    const safeMessage = token
      ? rawMessage.replaceAll(token, "[REDACTED_BOT_TOKEN]")
      : rawMessage;

    console.error("[telegram-testimonial]", safeMessage);

    return {
      ok: false,
      error: safeMessage,
    };
  }
}
