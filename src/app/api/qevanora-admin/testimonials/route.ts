import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import testimonialsFallback from "@/data/testimonials.json";
import {
  adminUnauthorizedResponse,
  isAdminRequest,
  isSameOriginRequest,
} from "@/lib/admin-api";
import { getTestimonials } from "@/lib/catalog";
import {
  cleanText,
  parseNonNegativeNumber,
  readImageUpload,
} from "@/lib/catalog-upload";
import {
  deleteRepositoryFile,
  getStoragePaths,
  updateJsonArray,
  writeRepositoryFile,
} from "@/lib/github-store";
import { sendTestimonialToTelegram } from "@/lib/telegram-testimonials";
import type { TransactionTestimonial } from "@/types/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function revalidateTestimonialPages() {
  revalidatePath("/");
  revalidatePath("/testimonials");
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return adminUnauthorizedResponse();
  }

  try {
    return NextResponse.json(
      { ok: true, testimonials: await getTestimonials({ strict: true }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Testimoni gagal dibaca.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  let mediaPath = "";

  if (!isAdminRequest(request)) {
    return adminUnauthorizedResponse();
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Origin tidak diizinkan." },
      { status: 403 },
    );
  }

  try {
    const form = await request.formData();
    const name = cleanText(form.get("name"), 120);
    const productName = cleanText(form.get("productName"), 180);
    const payment = cleanText(form.get("payment"), 100);
    const purchaseDate = cleanText(form.get("purchaseDate"), 100);
    const productPrice = parseNonNegativeNumber(
      form.get("productPrice"),
      "Harga produk",
    );
    const quantity = parseNonNegativeNumber(form.get("quantity"), "Jumlah beli");
    const totalPrice = parseNonNegativeNumber(
      form.get("totalPrice"),
      "Total harga",
    );
    const image = await readImageUpload(form.get("image"));

    if (
      !name ||
      !productName ||
      !payment ||
      !purchaseDate ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nama, produk, pembayaran, tanggal, jumlah, dan gambar wajib diisi dengan valid.",
        },
        { status: 400 },
      );
    }

    const id = `tst_${Date.now().toString(36)}_${randomUUID()
      .replaceAll("-", "")
      .slice(0, 6)}`;
    const now = new Date().toISOString();
    mediaPath = `storage/testimonials/${id}.${image.extension}`;

    await writeRepositoryFile(
      mediaPath,
      image.bytes,
      `admin testimonial: upload gambar ${id}`,
    );

    const testimonial: TransactionTestimonial = {
      id,
      status: "success",
      name,
      productName,
      productPrice,
      quantity,
      payment,
      totalPrice,
      purchaseDate,
      imagePath: mediaPath,
      image: `/api/media?path=${encodeURIComponent(mediaPath)}`,
      createdAt: now,
      updatedAt: now,
    };

    const { testimonials } = getStoragePaths();
    await updateJsonArray<TransactionTestimonial, TransactionTestimonial>(
      testimonials,
      testimonialsFallback as TransactionTestimonial[],
      `admin testimonial: tambah ${id}`,
      (current) => ({
        data: [
          testimonial,
          ...current.filter((item) => item.id !== id),
        ].slice(0, 1000),
        result: testimonial,
      }),
    );

    revalidateTestimonialPages();

    // Telegram bersifat distribusi tambahan. Kalau Telegram sedang bermasalah,
    // testimoni yang sudah berhasil tersimpan di website tidak di-rollback.
    const telegram = await sendTestimonialToTelegram(testimonial, image);

    return NextResponse.json(
      {
        ok: true,
        testimonial,
        telegram,
        warning: telegram.ok
          ? undefined
          : "Testimoni tersimpan di website, tetapi gagal dikirim ke channel Telegram.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (mediaPath) {
      try {
        await deleteRepositoryFile(
          mediaPath,
          `admin testimonial: rollback media ${mediaPath}`,
        );
      } catch {
        // Rollback media tidak boleh menutupi error utama.
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Testimoni gagal ditambahkan.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return adminUnauthorizedResponse();
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Origin tidak diizinkan." },
      { status: 403 },
    );
  }

  try {
    const id = String(request.nextUrl.searchParams.get("id") || "")
      .trim()
      .slice(0, 100);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID testimoni wajib diisi." },
        { status: 400 },
      );
    }

    const { testimonials } = getStoragePaths();
    const removed = await updateJsonArray<
      TransactionTestimonial,
      TransactionTestimonial
    >(
      testimonials,
      testimonialsFallback as TransactionTestimonial[],
      `admin testimonial: hapus ${id}`,
      (current) => {
        const testimonial = current.find((item) => item.id === id);
        if (!testimonial) {
          throw new Error("Testimoni tidak ditemukan.");
        }

        return {
          data: current.filter((item) => item.id !== id),
          result: testimonial,
        };
      },
    );

    if (removed.imagePath) {
      try {
        await deleteRepositoryFile(
          removed.imagePath,
          `admin testimonial: hapus gambar ${id}`,
        );
      } catch {
        // Data utama sudah terhapus; media dapat dibersihkan manual.
      }
    }

    revalidateTestimonialPages();

    return NextResponse.json(
      { ok: true, testimonial: removed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Testimoni gagal dihapus.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
