"use client";

import type { Product } from "@/types/catalog";
import { useState } from "react";

type Props = {
  initialProducts: Product[];
  initialError?: string;
};

type Notice = { type: "success" | "error"; message: string } | null;

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function AdminDeleteProductPage({
  initialProducts,
  initialError,
}: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState<Notice>(
    initialError ? { type: "error", message: initialError } : null,
  );

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `Hapus produk "${product.name}"? Tindakan ini tidak dapat dibatalkan.`,
    );

    if (!confirmed) return;

    setBusyId(product.id);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/qevanora-admin/products?id=${encodeURIComponent(product.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Produk gagal dihapus.");
      }

      setProducts((current) =>
        current.filter((item) => item.id !== product.id),
      );
      setNotice({
        type: "success",
        message: `Produk "${product.name}" berhasil dihapus.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Produk gagal dihapus.",
      });
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="w-full min-w-0 text-white">
      {notice && (
        <div
          role="status"
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-success-500/30 bg-success-500/10 text-success-300"
              : "border-error-500/30 bg-error-500/10 text-error-300"
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className="w-full min-w-0">
        <div className="mb-5">
          <p className="text-sm font-semibold text-brand-300">Hapus Produk</p>
          <h1 className="mt-1 text-2xl font-bold text-white">Daftar Produk</h1>
          <p className="mt-2 text-sm text-gray-400">{products.length} produk</p>
        </div>

        {products.length === 0 ? (
          <div className="rounded-3xl border border-brand-500/15 bg-[#100c09] px-5 py-12 text-center">
            <h2 className="font-semibold text-white">Belum ada produk</h2>
            <p className="mt-2 text-sm text-gray-400">
              Produk yang tersedia akan muncul di halaman ini.
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <article
                key={product.id}
                className="min-w-0 overflow-hidden rounded-3xl border border-brand-500/15 bg-[#100c09]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#1a2638]">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={`Gambar ${product.name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-gray-500">
                      Gambar produk tidak tersedia
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-brand-300">
                      {product.categoryName || "Produk"}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      Stok {Number(product.stock) || 0}
                    </span>
                  </div>

                  <h2 className="mt-3 break-words text-lg font-bold text-white">
                    {product.name}
                  </h2>

                  <p className="mt-3 text-lg font-bold text-white">
                    {formatRupiah(product.price)}
                  </p>

                  <button
                    type="button"
                    disabled={busyId === product.id}
                    onClick={() => deleteProduct(product)}
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-error-500/30 bg-error-500/10 px-4 text-sm font-semibold text-error-300 transition hover:bg-error-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyId === product.id ? "Menghapus..." : "Hapus Produk"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
