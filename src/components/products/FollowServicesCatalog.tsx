"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Product } from "@/types/catalog";

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

type Payload = {
  ok?: boolean;
  products?: Product[];
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
};

export default function FollowServicesCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "24" });
      if (search) params.set("search", search);
      const response = await fetch(`/api/follow/services?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as Payload;
      if (!response.ok || !payload.ok || !Array.isArray(payload.products)) {
        throw new Error(payload.error || "Layanan gagal dimuat.");
      }
      setProducts(payload.products);
      setTotal(Number(payload.total || 0));
      setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Layanan gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Followers Sosmed</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{total.toLocaleString("id-ID")} layanan tersedia.</p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full gap-2 sm:max-w-md">
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari Instagram, TikTok, YouTube..." className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-transparent px-4 py-3 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white" />
            <button className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600">Cari</button>
          </form>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-error-500/20 bg-error-500/10 p-5 text-sm text-error-500">{error}</div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />)}</div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">Layanan tidak ditemukan.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <p className="text-xs font-semibold text-brand-500">{product.providerCategory || "Followers Sosmed"}</p>
              <h3 className="mt-2 line-clamp-3 text-base font-semibold text-gray-800 dark:text-white/90">{product.name}</h3>
              <p className="mt-3 line-clamp-3 whitespace-pre-line text-xs leading-5 text-gray-500 dark:text-gray-400">{product.shortDescription}</p>
              <div className="mt-auto pt-5">
                <p className="text-lg font-bold text-gray-800 dark:text-white/90">{rupiah(product.ratePer1000 || product.price)} <span className="text-xs font-medium text-gray-400">/ 1.000</span></p>
                <Link href={`/products/followers-sosmed/${product.id}`} className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600">Pilih Layanan</Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {!error && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Sebelumnya</button>
          <span className="text-sm text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Berikutnya</button>
        </div>
      )}
    </div>
  );
}
