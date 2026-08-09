import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import testimonialsFallback from "@/data/testimonials.json";
import { requireBotAuthorization } from "@/lib/bot-auth";
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
import type { TransactionTestimonial } from "@/types/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(error: unknown) {
  if (error instanceof Error && error.message === "BOT_UNAUTHORIZED") {
    return NextResponse.json(
      { ok: false, error: "API secret bot tidak valid." },
      { status: 401 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    requireBotAuthorization(request);
    return NextResponse.json({
      ok: true,
      testimonials: await getTestimonials({ strict: true }),
    });
  } catch (error) {
    return (
      unauthorized(error) ||
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Testimoni gagal dibaca.",
        },
        { status: 500 },
      )
    );
  }
}

export async function POST(request: NextRequest) {
  let mediaPath = "";

  try {
    requireBotAuthorization(request);
    const form = await request.formData();
    const name = cleanText(form.get("name"), 120);
    const telegram = cleanText(form.get("telegram"), 120);
    const whatsapp = cleanText(form.get("whatsapp"), 80);
    const productName = cleanText(form.get("productName"), 180);
    const payment = cleanText(form.get("payment"), 100);
    const purchaseDate = cleanText(form.get("purchaseDate"), 100);
    const productPrice = parseNonNegativeNumber(
      form.get("productPrice"),
      "Harga produk",
    );
    const quantity = parseNonNegativeNumber(
      form.get("quantity"),
      "Jumlah beli",
    );
    const totalPrice = parseNonNegativeNumber(
      form.get("totalPrice"),
      "Total harga",
    );
    const image = await readImageUpload(form.get("image"));

    if (
      !name ||
      !telegram ||
      !whatsapp ||
      !productName ||
      !payment ||
      !purchaseDate ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Semua data testimoni wajib diisi dengan valid." },
        { status: 400 },
      );
    }

    const id = `tst_${Date.now().toString(36)}_${randomUUID().replaceAll("-", "").slice(0, 6)}`;
    const now = new Date().toISOString();
    mediaPath = `storage/testimonials/${id}.${image.extension}`;

    await writeRepositoryFile(
      mediaPath,
      image.bytes,
      `testimonial: upload gambar ${id}`,
    );

    const testimonial: TransactionTestimonial = {
      id,
      status: "success",
      name,
      telegram,
      whatsapp,
      productName,
      productPrice,
      quantity,
      payment,
      totalPrice,
      purchaseDate,
      imagePath: mediaPath,
      createdAt: now,
      updatedAt: now,
    };

    const { testimonials } = getStoragePaths();
    await updateJsonArray<
      TransactionTestimonial,
      TransactionTestimonial
    >(
      testimonials,
      testimonialsFallback as TransactionTestimonial[],
      `testimonial: tambah ${id}`,
      (current) => ({
        data: [
          testimonial,
          ...current.filter((item) => item.id !== id),
        ].slice(0, 1000),
        result: testimonial,
      }),
    );

    return NextResponse.json({ ok: true, testimonial }, { status: 201 });
  } catch (error) {
    if (mediaPath) {
      try {
        await deleteRepositoryFile(
          mediaPath,
          `testimonial: rollback media ${mediaPath}`,
        );
      } catch {
        // Rollback media tidak boleh menutupi error utama.
      }
    }

    return (
      unauthorized(error) ||
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Testimoni gagal ditambahkan.",
        },
        { status: 400 },
      )
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireBotAuthorization(request);
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
      `testimonial: hapus ${id}`,
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
          `testimonial: hapus gambar ${id}`,
        );
      } catch {
        // Data utama sudah terhapus; media yatim dapat dibersihkan manual.
      }
    }

    return NextResponse.json({ ok: true, testimonial: removed });
  } catch (error) {
    return (
      unauthorized(error) ||
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Testimoni gagal dihapus.",
        },
        { status: 400 },
      )
    );
  }
}
