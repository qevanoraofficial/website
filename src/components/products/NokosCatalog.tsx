"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type SortMode = "recommended" | "price-asc" | "stock-desc";

const quickFilters = ["Populer", "WhatsApp", "Telegram", "Google", "Instagram"] as const;

async function readJsonPayload(response: Response): Promise<Payload> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Payload;
  } catch {
    throw new Error(
      `Server mengembalikan respons non-JSON (HTTP ${response.status}). Silakan coba lagi.`,
    );
  }
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function serviceLabel(name: string) {
  const raw = String(name || "").split(" - ")[0].trim();
  return raw || name;
}

function serviceBadge(name: string) {
  const value = serviceLabel(name).toLowerCase();
  if (value.includes("whatsapp")) return "WA";
  if (value.includes("telegram")) return "TG";
  if (value.includes("instagram")) return "IG";
  if (value.includes("facebook")) return "FB";
  if (value.includes("google") || value.includes("youtube")) return "G";
  if (value.includes("discord")) return "DC";
  if (value.includes("amazon")) return "A";
  return serviceLabel(name).replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "OTP";
}

function countryIcon(country?: Country) {
  if (!country) return "🌐";
  return country.name.toLowerCase().includes("indonesia") ? "🇮🇩" : "🌐";
}

export default function NokosCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState(6);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof quickFilters)[number]>("Populer");
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedCountry = useMemo(
    () => countries.find((item) => item.id === country) || countries[0],
    [countries, country],
  );

  const visibleProducts = useMemo(() => {
    const copy = [...products];
    if (sortMode === "price-asc") return copy.sort((a, b) => a.price - b.price);
    if (sortMode === "stock-desc") return copy.sort((a, b) => b.stock - a.stock || a.price - b.price);
    return copy;
  }, [products, sortMode]);

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
      const payload = await readJsonPayload(response);
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
    const next = searchInput.trim();
    setPage(1);
    setActiveFilter(next ? "Populer" : activeFilter);
    setSearch(next);
  };

  const applyQuickFilter = (filter: (typeof quickFilters)[number]) => {
    const term = filter === "Populer" ? "" : filter;
    setActiveFilter(filter);
    setSearchInput(term);
    setSearch(term);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm dark:border-[#18314d] dark:bg-[#06111f]">
        <div className="border-b border-gray-100 px-5 py-6 dark:border-white/[0.06] sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-500">QEVANORA OTP</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Beli Nomor</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Pilih negara dan layanan untuk memulai aktivasi nomor virtual.
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-[#193552] dark:bg-[#030b15]">
            <button type="button" className="rounded-xl bg-brand-500 px-3 py-3 text-sm font-bold text-white shadow-sm">
              ◉ Per Negara
            </button>
            <button type="button" onClick={() => setSortMode("price-asc")} className="rounded-xl px-3 py-3 text-sm font-bold text-gray-600 transition hover:text-brand-500 dark:text-gray-300">
              ◈ Cari Termurah
            </button>
          </div>

          <div className="mt-4 space-y-3 rounded-3xl border border-gray-200 bg-gray-50/70 p-3 dark:border-[#193552] dark:bg-[#071321]">
            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-[#030b15]">
              <span className="text-2xl" aria-hidden="true">{countryIcon(selectedCountry)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Negara</span>
                <select
                  value={country}
                  onChange={(event) => { setCountry(Number(event.target.value)); setPage(1); }}
                  className="mt-0.5 w-full appearance-none bg-transparent text-base font-bold text-gray-900 outline-none dark:text-white"
                >
                  {countries.length === 0 && <option value={6}>Indonesia</option>}
                  {countries.map((item) => (
                    <option key={item.id} value={item.id} className="bg-white text-gray-900 dark:bg-[#071321] dark:text-white">
                      {item.name}{item.prefix ? ` ${item.prefix}` : ""}
                    </option>
                  ))}
                </select>
              </span>
              <span className="text-gray-400" aria-hidden="true">⌄</span>
            </label>

            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-[#030b15]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500" aria-hidden="true">⇄</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Operator</span>
                <span className="mt-0.5 block text-base font-bold text-gray-900 dark:text-white">Any</span>
              </span>
              <span className="text-gray-400" aria-hidden="true">⌄</span>
            </div>

            <form onSubmit={submitSearch} className="flex gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 dark:border-white/[0.06] dark:bg-[#0a1627]">
                <span className="text-lg text-gray-400" aria-hidden="true">⌕</span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Cari layanan: WhatsApp, Telegram..."
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                />
              </label>
              <button type="submit" className="rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600">Cari</button>
            </form>

            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-[#030b15]">
              <button type="button" onClick={() => setFilterOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="text-sm font-bold text-gray-900 dark:text-white">Populer</span>
                <span className="text-gray-400" aria-hidden="true">⌄</span>
              </button>
              {filterOpen && (
                <div className="mt-3 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Urutkan layanan
                    <select
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                      className="mt-2 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-[#24405f] dark:bg-[#071321] dark:text-white"
                    >
                      <option value="recommended">Rekomendasi</option>
                      <option value="price-asc">Harga termurah</option>
                      <option value="stock-desc">Stok terbanyak</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            <button type="button" onClick={() => setFilterOpen((value) => !value)} className="inline-flex w-fit items-center gap-2 rounded-xl bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-500">
              ☷ Filter Lanjutan <span aria-hidden="true">⌄</span>
            </button>
          </div>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {quickFilters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => applyQuickFilter(filter)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
              activeFilter === filter
                ? "border-brand-500/50 bg-brand-500/10 text-brand-500"
                : "border-gray-200 bg-white text-gray-700 hover:border-brand-500/30 hover:text-brand-500 dark:border-[#18314d] dark:bg-[#06111f] dark:text-gray-200"
            }`}
          >
            {filter === "Populer" ? "✦ Populer" : filter}
          </button>
        ))}
      </div>

      {error && <div className="rounded-2xl border border-error-500/20 bg-error-500/10 p-4 text-sm text-error-500">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-52 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-[#18314d] dark:bg-[#06111f]" />)}
        </div>
      ) : products.length === 0 ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-[#18314d] dark:bg-[#06111f]">
          <h2 className="font-semibold text-gray-800 dark:text-white/90">Stok belum tersedia</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Coba negara atau layanan lain.</p>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 px-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{total.toLocaleString("id-ID")} layanan tersedia</span>
            <span>Halaman {page} / {totalPages}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map((product, index) => {
              const label = serviceLabel(product.name);
              return (
                <article key={product.id} className="relative min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-500/35 dark:border-[#18314d] dark:bg-[#06111f]">
                  {index < 6 && (
                    <span className="absolute right-2 top-2 rounded-lg bg-brand-500 px-2 py-1 text-[9px] font-extrabold text-white">HOT</span>
                  )}

                  <div className="flex min-w-0 items-center gap-2.5 pr-8">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/15 to-brand-500/[0.03] text-sm font-black text-brand-500">
                      {serviceBadge(product.name)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-sm font-bold leading-5 text-gray-900 dark:text-white">{label}</h2>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{Number(product.stock).toLocaleString("id-ID")} stok</p>
                    </div>
                  </div>

                  <p className="mt-4 text-lg font-extrabold tracking-tight text-brand-500">{formatRupiah(product.price)}</p>
                  <NokosBuyButton compact productId={product.id} productName={product.name} price={product.price} stock={product.stock} />
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40 dark:border-[#18314d] dark:bg-[#06111f] dark:text-gray-300">Sebelumnya</button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-500 disabled:opacity-40">Berikutnya</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
