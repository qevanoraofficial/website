"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import NokosBuyButton from "@/components/products/NokosBuyButton";

type Country = { id: number; name: string; prefix?: string };
type Product = {
  id: string;
  name: string;
  shortDescription?: string;
  price: number;
  stock: number;
};

type Payload = {
  ok?: boolean;
  products?: Product[];
  countries?: Country[];
  country?: Country;
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
};

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function NokosCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState(6);
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
      const params = new URLSearchParams({
        country: String(country),
        search,
        page: String(page),
        limit: "24",
      });
      const response = await fetch(`/api/nokos/catalog?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as Payload;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Layanan Nokos gagal dimuat.");
      setProducts(Array.isArray(payload.products) ? payload.products : []);
      setCountries(Array.isArray(payload.countries) ? payload.countries : []);
      setTotal(Number(payload.total || 0));
      setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Layanan Nokos gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [country, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Nokos</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          Pilih layanan dan negara. Harga serta stok diperbarui otomatis.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
            Negara
            <select
              value={country}
              onChange={(event) => { setCountry(Number(event.target.value)); setPage(1); }}
              className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-3 text-sm font-normal text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-[#071321] dark:text-white"
            >
              {countries.length === 0 && <option value={6}>Indonesia</option>}
              {countries.map((item) => (
                <option key={item.id} value={item.id}>{item.name}{item.prefix ? ` (${item.prefix})` : ""}</option>
              ))}
            </select>
          </label>

          <form onSubmit={submitSearch} className="block">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
              Cari layanan
              <div className="mt-2 flex gap-2">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="WhatsApp, Telegram, Instagram..."
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-transparent px-3 py-3 text-sm font-normal text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white"
                />
                <button type="submit" className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600">Cari</button>
              </div>
            </label>
          </form>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-error-500/20 bg-error-500/10 p-4 text-sm text-error-500">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />)}
        </div>
      ) : products.length === 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Stok belum tersedia</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Coba negara atau layanan lain.</p>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{total.toLocaleString("id-ID")} layanan tersedia</span>
            <span>Halaman {page} / {totalPages}</span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-xs font-semibold text-brand-500">Nokos</p>
                <h2 className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90">{product.name}</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-500 dark:text-gray-400">{product.shortDescription}</p>
                <div className="mt-5 flex items-end justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <p className="text-xl font-bold text-gray-800 dark:text-white/90">{formatRupiah(product.price)}</p>
                  <span className="text-xs text-gray-400">Stok {Number(product.stock).toLocaleString("id-ID")}</span>
                </div>
                <NokosBuyButton productId={product.id} productName={product.name} price={product.price} stock={product.stock} />
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Sebelumnya</button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300">Berikutnya</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
