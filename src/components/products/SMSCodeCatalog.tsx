"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

type ReferencePayload = {
  ok?: boolean;
  countries?: Country[];
  error?: string;
};

type CatalogPayload = {
  ok?: boolean;
  country?: Country;
  products?: CatalogProduct[];
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
};

const QUICK_SERVICES = [
  "",
  "WhatsApp",
  "Telegram",
  "TikTok",
  "Discord",
  "Google",
  "OpenAI",
  "Instagram",
] as const;

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "popular", label: "Populer" },
  { value: "price", label: "Termurah" },
  { value: "stock", label: "Stok terbanyak" },
  { value: "name", label: "A → Z" },
];

const MAX_PRICE_OPTIONS = [
  { value: 0, label: "Semua harga" },
  { value: 1000, label: "≤ Rp1.000" },
  { value: 2500, label: "≤ Rp2.500" },
  { value: 5000, label: "≤ Rp5.000" },
  { value: 10000, label: "≤ Rp10.000" },
];

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function serviceBadge(name: string) {
  const value = String(name || "").toLowerCase();
  if (value.includes("whatsapp")) return "WA";
  if (value.includes("telegram")) return "TG";
  if (value.includes("instagram")) return "IG";
  if (value.includes("facebook")) return "FB";
  if (value.includes("tiktok")) return "TT";
  if (value.includes("discord")) return "DC";
  if (value.includes("google")) return "G";
  if (value.includes("openai") || value.includes("chatgpt")) return "AI";
  if (value.includes("microsoft")) return "MS";
  if (value.includes("apple")) return "AP";
  return String(name || "OTP")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase() || "OTP";
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server mengembalikan respons non-JSON (HTTP ${response.status}).`);
  }
}

export default function SMSCodeCatalog() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState("ID");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [maxPrice, setMaxPrice] = useState(0);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingReference, setLoadingReference] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoadingReference(true);
      try {
        const response = await fetch("/api/smscode/reference", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await parseJson<ReferencePayload>(response);
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Daftar negara SMSCode gagal dimuat.");
        }
        const nextCountries = payload.countries || [];
        setCountries(nextCountries);
        if (!nextCountries.some((country) => country.code === countryCode)) {
          setCountryCode(nextCountries[0]?.code || "ID");
        }
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Daftar negara gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoadingReference(false);
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
      setLoadingCatalog(true);
      setError("");
      try {
        const params = new URLSearchParams({
          country: countryCode,
          search,
          sort,
          page: String(page),
          limit: "24",
        });
        if (maxPrice > 0) params.set("maxPrice", String(maxPrice));

        const response = await fetch(`/api/smscode/catalog?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await parseJson<CatalogPayload>(response);
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Katalog SMSCode gagal dimuat.");
        }

        setProducts(payload.products || []);
        setTotal(Number(payload.total || 0));
        setTotalPages(Math.max(1, Number(payload.totalPages || 1)));
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setProducts([]);
        setTotal(0);
        setTotalPages(1);
        setError(caught instanceof Error ? caught.message : "Katalog SMSCode gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      }
    })();

    return () => controller.abort();
  }, [countryCode, search, sort, maxPrice, page]);

  const selectedCountry = useMemo(
    () => countries.find((country) => country.code === countryCode),
    [countries, countryCode],
  );

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-100 px-5 py-5 dark:border-gray-800 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  SMSCode Live
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  Katalog uji
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-gray-800 dark:text-white/90">
                Nomor OTP Internasional
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Harga dan stok dibaca langsung dari SMSCode lalu dihitung menjadi harga jual QEVANORA. Modal supplier tidak ditampilkan ke pelanggan.
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-white/[0.04]">
              <div className="font-medium text-gray-700 dark:text-gray-200">
                {selectedCountry?.emoji || "🌐"} {selectedCountry?.name || "Memuat negara..."}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {loadingCatalog ? "Menyinkronkan katalog..." : `${total.toLocaleString("id-ID")} layanan tersedia`}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[1.1fr_1.5fr_0.8fr_0.8fr]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Negara</span>
              <select
                value={countryCode}
                disabled={loadingReference}
                onChange={(event) => {
                  setCountryCode(event.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {countries.map((country) => (
                  <option key={country.id} value={country.code}>
                    {country.emoji || "🌐"} {country.name} {country.dialCode || ""}
                  </option>
                ))}
              </select>
            </label>

            <form onSubmit={handleSearch} className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Cari layanan</span>
              <div className="flex gap-2">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="WhatsApp, Telegram, TikTok..."
                  className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
                <button
                  type="submit"
                  className="h-11 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600"
                >
                  Cari
                </button>
              </div>
            </form>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Urutkan</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortMode);
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-300">Harga jual</span>
              <select
                value={maxPrice}
                onChange={(event) => {
                  setMaxPrice(Number(event.target.value));
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                {MAX_PRICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_SERVICES.map((service) => {
              const active = search === service && searchInput.trim() === service;
              return (
                <button
                  key={service || "popular"}
                  type="button"
                  onClick={() => {
                    setSearchInput(service);
                    setSearch(service);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                      : "border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300"
                  }`}
                >
                  {service || "Populer"}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </section>
      ) : null}

      {loadingCatalog ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <section className="flex min-h-[280px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div>
            <div className="text-3xl">📭</div>
            <h3 className="mt-3 font-semibold text-gray-800 dark:text-white/90">Tidak ada layanan cocok</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Coba negara, kata pencarian, atau batas harga lain.</p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="flex min-h-52 flex-col rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                    {serviceBadge(product.serviceName)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-800 dark:text-white/90">{product.serviceName}</h3>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {product.countryEmoji} {product.countryName} {product.dialCode}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">
                  Stok {product.stock.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="mt-5">
                <p className="text-xs text-gray-500 dark:text-gray-400">Harga QEVANORA</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{formatRupiah(product.price)}</p>
              </div>

              <div className="mt-auto pt-5">
                <button
                  type="button"
                  disabled
                  title="Order SMSCode akan diaktifkan setelah flow checkout dan refund lolos pengujian."
                  className="inline-flex h-10 w-full cursor-not-allowed items-center justify-center rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                >
                  Checkout segera diaktifkan
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loadingCatalog && totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            Sebelumnya
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">Halaman {page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            Berikutnya
          </button>
        </div>
      ) : null}
    </div>
  );
}
