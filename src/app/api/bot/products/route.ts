import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import productsFallback from "@/data/products.json";
import { requireBotAuthorization } from "@/lib/bot-auth";
import { getProducts } from "@/lib/catalog";
import {
  cleanText,
  parseNonNegativeNumber,
  parseStock,
  readImageUpload,
  slugifyCategory,
} from "@/lib/catalog-upload";
import {
  deleteRepositoryFile,
  getStoragePaths,
  updateJsonArray,
  writeRepositoryFile,
} from "@/lib/github-store";
import type { Product } from "@/types/catalog";

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
      products: await getProducts({ includeInactive: true, strict: true }),
    });
  } catch (error) {
    return (
      unauthorized(error) ||
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "Produk gagal dibaca.",
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
    const name = cleanText(form.get("name"), 160);
    const categoryName = cleanText(form.get("categoryName"), 120);
    const shortDescription = cleanText(form.get("shortDescription"), 1000);
    const fullDescription = cleanText(form.get("fullDescription"), 6000);
    const stock = parseStock(form.get("stock"));
    const price = parseNonNegativeNumber(form.get("price"), "Harga");
    const image = await readImageUpload(form.get("image"));

    if (!name || !categoryName || !shortDescription || !fullDescription) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nama, kategori, deskripsi singkat, dan deskripsi lengkap wajib diisi.",
        },
        { status: 400 },
      );
    }

    const id = `prd_${Date.now().toString(36)}_${randomUUID().replaceAll("-", "").slice(0, 6)}`;
    const now = new Date().toISOString();
    const category = slugifyCategory(categoryName);
    mediaPath = `storage/products/${id}.${image.extension}`;

    await writeRepositoryFile(
      mediaPath,
      image.bytes,
      `product: upload gambar ${id}`,
    );

    const product: Product = {
      id,
      category,
      categoryName,
      name,
      shortDescription,
      fullDescription,
      description: shortDescription,
      price,
      stock,
      active: true,
      imagePath: mediaPath,
      createdAt: now,
      updatedAt: now,
    };

    const { products } = getStoragePaths();
    await updateJsonArray<Product, Product>(
      products,
      productsFallback as Product[],
      `product: tambah ${id}`,
      (current) => ({
        data: [product, ...current.filter((item) => item.id !== id)].slice(
          0,
          1000,
        ),
        result: product,
      }),
    );

    return NextResponse.json({ ok: true, product }, { status: 201 });
  } catch (error) {
    if (mediaPath) {
      try {
        await deleteRepositoryFile(
          mediaPath,
          `product: rollback media ${mediaPath}`,
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
              : "Produk gagal ditambahkan.",
        },
        { status: 400 },
      )
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    requireBotAuthorization(request);
    const body = (await request.json()) as { id?: unknown; stock?: unknown };
    const id = String(body.id || "").trim().slice(0, 100);
    const stockNumber = Number(body.stock);

    if (!id || !Number.isInteger(stockNumber) || stockNumber < 0) {
      return NextResponse.json(
        { ok: false, error: "ID produk dan stok valid wajib diisi." },
        { status: 400 },
      );
    }

    const { products } = getStoragePaths();
    const updated = await updateJsonArray<Product, Product>(
      products,
      productsFallback as Product[],
      `product: stok ${id} menjadi ${stockNumber}`,
      (current) => {
        const index = current.findIndex((item) => item.id === id);
        if (index < 0) {
          throw new Error("Produk tidak ditemukan.");
        }

        const product: Product = {
          ...current[index],
          stock: stockNumber,
          updatedAt: new Date().toISOString(),
        };
        const next = [...current];
        next[index] = product;
        return { data: next, result: product };
      },
    );

    return NextResponse.json({ ok: true, product: updated });
  } catch (error) {
    return (
      unauthorized(error) ||
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "Stok gagal diubah.",
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
        { ok: false, error: "ID produk wajib diisi." },
        { status: 400 },
      );
    }

    const { products } = getStoragePaths();
    const removed = await updateJsonArray<Product, Product>(
      products,
      productsFallback as Product[],
      `product: hapus ${id}`,
      (current) => {
        const product = current.find((item) => item.id === id);
        if (!product) {
          throw new Error("Produk tidak ditemukan.");
        }
        return {
          data: current.filter((item) => item.id !== id),
          result: product,
        };
      },
    );

    if (removed.imagePath) {
      try {
        await deleteRepositoryFile(
          removed.imagePath,
          `product: hapus gambar ${id}`,
        );
      } catch {
        // Data utama sudah terhapus; media yatim dapat dibersihkan manual.
      }
    }

    return NextResponse.json({ ok: true, product: removed });
  } catch (error) {
    return (
      unauthorized(error) ||
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "Produk gagal dihapus.",
        },
        { status: 400 },
      )
    );
  }
}
