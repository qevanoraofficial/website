import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import productsFallback from "@/data/products.json";
import {
  adminUnauthorizedResponse,
  isAdminRequest,
  isSameOriginRequest,
} from "@/lib/admin-api";
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

function revalidateProductPages(product?: Product) {
  revalidatePath("/");
  revalidatePath("/products/[category]", "page");
  revalidatePath("/products/[category]/[id]", "page");

  if (product?.category) {
    revalidatePath(`/products/${product.category}`);
  }

  if (product?.category && product.id) {
    revalidatePath(`/products/${product.category}/${product.id}`);
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return adminUnauthorizedResponse();
  }

  try {
    return NextResponse.json(
      {
        ok: true,
        products: await getProducts({ includeInactive: true, strict: true }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Produk gagal dibaca.",
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

    const id = `prd_${Date.now().toString(36)}_${randomUUID()
      .replaceAll("-", "")
      .slice(0, 6)}`;
    const now = new Date().toISOString();
    const category = slugifyCategory(categoryName);
    mediaPath = `storage/products/${id}.${image.extension}`;

    await writeRepositoryFile(
      mediaPath,
      image.bytes,
      `admin product: upload gambar ${id}`,
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
      image: `/api/media?path=${encodeURIComponent(mediaPath)}`,
      createdAt: now,
      updatedAt: now,
    };

    const { products } = getStoragePaths();
    await updateJsonArray<Product, Product>(
      products,
      productsFallback as Product[],
      `admin product: tambah ${id}`,
      (current) => ({
        data: [product, ...current.filter((item) => item.id !== id)].slice(
          0,
          1000,
        ),
        result: product,
      }),
    );

    revalidateProductPages(product);

    return NextResponse.json(
      { ok: true, product },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (mediaPath) {
      try {
        await deleteRepositoryFile(
          mediaPath,
          `admin product: rollback media ${mediaPath}`,
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
            : "Produk gagal ditambahkan.",
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
        { ok: false, error: "ID produk wajib diisi." },
        { status: 400 },
      );
    }

    const { products } = getStoragePaths();
    const removed = await updateJsonArray<Product, Product>(
      products,
      productsFallback as Product[],
      `admin product: hapus ${id}`,
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
          `admin product: hapus gambar ${id}`,
        );
      } catch {
        // Data utama sudah terhapus; media dapat dibersihkan manual.
      }
    }

    revalidateProductPages(removed);

    return NextResponse.json(
      { ok: true, product: removed },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Produk gagal dihapus.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(request: NextRequest) {
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
    const id = cleanText(form.get("id"), 100);
    const stock = parseStock(form.get("stock"));

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Produk wajib dipilih." },
        { status: 400 },
      );
    }

    const { products } = getStoragePaths();
    const updatedProduct = await updateJsonArray<Product, Product>(
      products,
      productsFallback as Product[],
      `admin product: ubah stok ${id} menjadi ${stock}`,
      (current) => {
        const index = current.findIndex((item) => item.id === id);

        if (index < 0) {
          throw new Error("Produk tidak ditemukan.");
        }

        const product: Product = {
          ...current[index],
          stock,
          updatedAt: new Date().toISOString(),
        };
        const data = [...current];
        data[index] = product;

        return { data, result: product };
      },
    );

    revalidateProductPages(updatedProduct);

    return NextResponse.json(
      { ok: true, product: updatedProduct },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Stok gagal diperbarui.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
