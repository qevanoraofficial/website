"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import SMSCodeBuyButton from "@/components/products/SMSCodeBuyButton";

type SortMode = "popular" | "price" | "stock" | "name";

type Country = {
  id: number;
  code: string;
  name: string;
  dialCode?: string;
  emoji?: string;
};

type CatalogProduct = {
  id: string;
  catalogProductId: number;
  platformId: number;
  serviceCode: string;
  serviceName: string;
  countryId: number;
  countryCode: string;
  countryName: string;
  countryEmoji: string;
  dialCode: string;
  price: number;
  stock: number;
  active: boolean;
};

type ReferencePayload = { ok?: boolean; countries?: Country[]; error?: string };
type CatalogPayload = {
  ok?: boolean;
  products?: CatalogProduct[];
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

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server mengembalikan respons non-JSON (HTTP ${response.status}).`);
  }
}

function badge(name: string) {
  const value = name.toLowerCase();
  if (value.includes("whatsapp")) return "WA";
  if (value.includes("telegram")) return "TG";
  if (value.includes("instagram")) return "IG";
  if (value.includes("tiktok")) return "TT";
  if (value.includes("discord")) return "DC";
  if (value.includes("openai") || value.includes("chatgpt")) return "AI";
  if (value.includes("google")) return "G";
  return name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "OTP";
}

const QUICK = ["", "WhatsApp", "Telegram", "TikTok", "Discord", "OpenAI", "Instagram", "Google"];

export default function SMSCodeCatalogCheckout() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState("ID");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/smscode/reference", { cache: "no-store", signal: controller.signal });
        const payload = await readJson<ReferencePayload>(response);
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Daftar negara gagal dimuat.");
        const list = payload.countries || [];
        setCountries(list);
        setCountryCode((current) => list.some((item) => item.code === current) ? current : list[0]?.code || "ID");
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Daftar negara gagal dimuat.");
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          country: countryCode,
          search,
          sort,
          page: String(page),
          limit: "24",
        });
        const response = await fetch(`/api/smscode/catalog?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await readJson<CatalogPayload>(response);
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Katalog SMSCode gagal dimuat.");
        setProducts(payload.products || []);
        setTotal(Number(payload.total || 0));
        setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setProducts([]);
        setError(caught instanceof Error ? caught.message : "Katalog SMSCode gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [countryCode, search, sort, page]);

  const country = useMemo(() => countries.find((item) => item.code === countryCode), [countries, countryCode]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-500">SMSCode Live</div>
            <h2 className="mt-3 text-xl font-black text-gray-900 dark:text-white">Nomor OTP Internasional</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Harga dan stok live. Harga dicek ulang sekali lagi sebelum saldo dipotong.</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-white/[0.04]">
            <div className="font-bold text-gray-800 dark:text-white">{country?.emoji || "🌐"} {country?.name || "Memuat..."}</div>
            <div className="mt-1 text-xs text-gray-500">{loading ? "Sinkronisasi..." : `${total.toLocaleString("id-ID")} layanan tersedia`}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.5fr_.8fr]">
          <label>
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-gray-300">Negara</span>
            <select
              value={countryCode}
              onChange={(event) => { setCountryCode(event.target.value); setPage(1); }}
              className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {countries.map((item) => <option key={item.id} value={item.code}>{item.emoji || "🌐"} {item.name} {item.dialCode || ""}</option>)}
            </select>
          </label>

          <form onSubmit={submit}>
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-gray-300">Cari layanan</span>
            <div className="flex gap-2">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="WhatsApp, Telegram, TikTok..."
                className="h-11 min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <button type="submit" className="rounded-xl bg-brand-500 px-4 text-sm font-bold text-white">Cari</button>
            </div>
          </form>

          <label>
            <span className="mb-1.5 block text-xs font-bold text-gray-600 dark:text-gray-300">Urutkan</span>
            <select
              value={sort}
              onChange={(event) => { setSort(event.target.value as SortMode); setPage(1); }}
              className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              <option value="popular">Populer</option>
              <option value="price">Termurah</option>
              <option value="stock">Stok terbanyak</option>
              <option value="name">A → Z</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK.map((item) => (
            <button
              key={item || "popular"}
              type="button"
              onClick={() => { setSearchInput(item); setSearch(item); setPage(1); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${search === item ? "border-brand-500 bg-brand-500/10 text-brand-500" : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"}`}
            >
              {item || "Populer"}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-error-500/20 bg-error-500/10 p-4 text-sm text-error-500">{error}</div>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">Tidak ada layanan yang cocok.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={`${product.catalogProductId}:${product.countryId}`} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-sm font-black text-brand-500">{badge(product.serviceName)}</div>
                <div className="min-w-0">
                  <h3 className="truncate font-black text-gray-900 dark:text-white">{product.serviceName}</h3>
                  <p className="mt-1 text-xs text-gray-500">{product.countryEmoji} {product.countryName} {product.dialCode}</p>
                </div>
              </div>

              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500">Harga</p>
                  <p className="text-xl font-black text-brand-500">{formatRupiah(product.price)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Stok</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{product.stock.toLocaleString("id-ID")}</p>
                </div>
              </div>

              <div className="mt-auto">
                <SMSCodeBuyButton
                  catalogProductId={product.catalogProductId}
                  platformId={product.platformId}
                  countryId={product.countryId}
                  serviceName={product.serviceName}
                  countryName={product.countryName}
                  price={product.price}
                  stock={product.stock}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-gray-700">Sebelumnya</button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-gray-700">Berikutnya</button>
        </div>
      )}
    </div>
  );
}
