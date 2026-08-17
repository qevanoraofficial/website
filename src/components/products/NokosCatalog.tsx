"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import NokosBuyButton from "@/components/products/NokosBuyButton";

type ServerMode = "s1" | "s2";
type CatalogMode = "country" | "cheapest";
type CountrySort = "popular" | "price" | "stock" | "name";
type CheapestSort = "price" | "stock" | "name";
type Region = "all" | "southeast-asia" | "europe" | "americas" | "africa";

type Service = {
  code: string;
  name: string;
};

type Country = {
  id: number;
  name: string;
  prefix?: string;
};

type Product = {
  id: string;
  name: string;
  shortDescription?: string;
  price: number;
  stock: number;
  nokosServiceCode?: string;
  nokosCountryId?: number;
  nokosCountryName?: string;
  nokosCountryPrefix?: string;
  nokosServer?: ServerMode;
};

type CatalogPayload = {
  ok?: boolean;
  mode?: CatalogMode;
  products?: Product[];
  countries?: Country[];
  country?: Country;
  service?: Service;
  server?: ServerMode;
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
};

type ReferencePayload = {
  ok?: boolean;
  services?: Service[];
  countries?: Country[];
  error?: string;
};

type UserOrder = {
  id: string;
  productName?: string;
  status?: "pending" | "accepted" | "completed" | "cancelled" | "failed";
  supplier?: string;
  phone?: string;
  otpCode?: string;
  countryName?: string;
};

type OrdersPayload = {
  ok?: boolean;
  orders?: UserOrder[];
  error?: string;
};

type OperatorOption = {
  value: string;
  label: string;
  subtitle?: string;
};

const quickFilters = [
  "Populer",
  "WhatsApp",
  "Telegram",
  "Instagram",
  "Facebook",
  "TikTok",
  "Tinder",
  "Discord",
  "Google",
  "Netflix",
] as const;

const indonesiaOperators: OperatorOption[] = [
  { value: "any", label: "Semua Operator", subtitle: "any" },
  { value: "telkomsel", label: "Telkomsel", subtitle: "telkomsel" },
  { value: "indosat", label: "Indosat Ooredoo", subtitle: "indosat" },
  { value: "xl", label: "XL Axiata", subtitle: "xl" },
  { value: "tri", label: "3 (Tri)", subtitle: "tri" },
  { value: "axis", label: "AXIS", subtitle: "axis" },
  { value: "smartfren", label: "Smartfren", subtitle: "smartfren" },
];

const minStockOptions = [
  { value: 0, label: "Semua" },
  { value: 50, label: "50+" },
  { value: 500, label: "500+" },
  { value: 5000, label: "5.000+" },
];

const maxPriceOptions = [
  { value: 0, label: "Tidak dibatasi" },
  { value: 500, label: "≤ Rp 500" },
  { value: 2000, label: "≤ Rp 2.000" },
  { value: 5000, label: "≤ Rp 5.000" },
  { value: 20000, label: "≤ Rp 20.000" },
];

const countrySortOptions: Array<{ value: CountrySort; label: string }> = [
  { value: "popular", label: "Populer" },
  { value: "price", label: "Termurah" },
  { value: "stock", label: "Stok terbanyak" },
  { value: "name", label: "A → Z" },
];

const cheapestSortOptions: Array<{ value: CheapestSort; label: string }> = [
  { value: "price", label: "Termurah dulu" },
  { value: "stock", label: "Stok terbanyak" },
  { value: "name", label: "A → Z negara" },
];

const regionOptions: Array<{ value: Region; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "southeast-asia", label: "Asia Tenggara" },
  { value: "europe", label: "Eropa" },
  { value: "americas", label: "Amerika" },
  { value: "africa", label: "Afrika" },
];

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server mengembalikan respons non-JSON (HTTP ${response.status}).`);
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

function normalized(value: string) {
  return String(value || "").trim().toLowerCase();
}

function isPopularService(name: string) {
  const value = normalized(name);
  return [
    "whatsapp",
    "telegram",
    "instagram",
    "facebook",
    "tiktok",
    "google",
    "youtube",
    "discord",
    "tinder",
    "netflix",
    "amazon",
  ].some((term) => value.includes(term));
}

function serviceBadge(name: string) {
  const value = normalized(serviceLabel(name));
  if (value.includes("whatsapp")) {
    return (
      <img
        src="/images/nokos/whatsapp.svg"
        alt=""
        aria-hidden="true"
        className="h-6 w-6 object-contain"
      />
    );
  }
  if (value.includes("telegram")) return "TG";
  if (value.includes("instagram")) return "IG";
  if (value.includes("facebook")) {
    return (
      <img
        src="/images/nokos/facebook.svg"
        alt=""
        aria-hidden="true"
        className="h-6 w-6 object-contain"
      />
    );
  }
  if (value.includes("tiktok")) return "TT";
  if (value.includes("google") || value.includes("youtube")) return "G";
  if (value.includes("discord")) return "DC";
  if (value.includes("tinder")) return "TD";
  if (value.includes("netflix")) return "N";
  if (value.includes("amazon")) return "A";
  return serviceLabel(name).replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "OTP";
}

const flagMap: Record<string, string> = {
  indonesia: "🇮🇩",
  malaysia: "🇲🇾",
  singapore: "🇸🇬",
  thailand: "🇹🇭",
  vietnam: "🇻🇳",
  philippines: "🇵🇭",
  cambodia: "🇰🇭",
  laos: "🇱🇦",
  myanmar: "🇲🇲",
  brunei: "🇧🇳",
  morocco: "🇲🇦",
  uzbekistan: "🇺🇿",
  angola: "🇦🇴",
  zimbabwe: "🇿🇼",
  chile: "🇨🇱",
  "papua new guinea": "🇵🇬",
  italy: "🇮🇹",
  usa: "🇺🇸",
  "united states": "🇺🇸",
  kazakhstan: "🇰🇿",
  uae: "🇦🇪",
  "united arab emirates": "🇦🇪",
  hungary: "🇭🇺",
  "south africa": "🇿🇦",
  kyrgyzstan: "🇰🇬",
  bolivia: "🇧🇴",
  cameroon: "🇨🇲",
  guatemala: "🇬🇹",
  libya: "🇱🇾",
  ukraine: "🇺🇦",
  guinea: "🇬🇳",
  germany: "🇩🇪",
  france: "🇫🇷",
  india: "🇮🇳",
  japan: "🇯🇵",
  korea: "🇰🇷",
  "south korea": "🇰🇷",
  china: "🇨🇳",
  australia: "🇦🇺",
  brazil: "🇧🇷",
  canada: "🇨🇦",
  mexico: "🇲🇽",
  argentina: "🇦🇷",
  egypt: "🇪🇬",
  nigeria: "🇳🇬",
  turkey: "🇹🇷",
  "united kingdom": "🇬🇧",
  russia: "🇷🇺",
};

function countryFlag(country?: Country | string) {
  const name = typeof country === "string" ? country : country?.name || "";
  return flagMap[normalized(name)] || "🌐";
}

function operatorLabel(value: string) {
  return indonesiaOperators.find((item) => item.value === value)?.label || "Semua Operator";
}

function serverLabel(server: ServerMode) {
  return server === "s1" ? "Server Express" : "Server Plus";
}

function serverDescription(server: ServerMode) {
  return server === "s1"
    ? "Harga & stok API • Server Express"
    : "Harga & stok API • Server Plus";
}

function serviceRank(service: Service) {
  const value = normalized(`${service.name} ${service.code}`);
  const popular = [
    "whatsapp",
    "telegram",
    "instagram",
    "facebook",
    "tiktok",
    "google",
    "youtube",
    "discord",
    "tinder",
    "netflix",
    "amazon",
  ];
  const index = popular.findIndex((term) => value.includes(term));
  return index === -1 ? 9999 : index;
}

export default function NokosCatalog() {
  const [mode, setMode] = useState<CatalogMode>("country");
  const [server, setServer] = useState<ServerMode>("s2");
  const [countries, setCountries] = useState<Country[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [country, setCountry] = useState(6);
  const [operator, setOperator] = useState("any");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] =
    useState<(typeof quickFilters)[number]>("Populer");
  const [countrySort, setCountrySort] = useState<CountrySort>("popular");
  const [cheapestSort, setCheapestSort] = useState<CheapestSort>("price");
  const [minStock, setMinStock] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [region, setRegion] = useState<Region>("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [operatorModalOpen, setOperatorModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState("");
  const [serverModalOpen, setServerModalOpen] = useState(false);

  const [activeOrders, setActiveOrders] = useState<UserOrder[]>([]);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const selectedCountry = useMemo(
    () => countries.find((item) => item.id === country) || countries[0],
    [countries, country],
  );

  const operatorOptions = useMemo<OperatorOption[]>(
    () => (country === 6 ? indonesiaOperators : [{ value: "any", label: "Semua Operator", subtitle: "any" }]),
    [country],
  );

  const filteredCountries = useMemo(() => {
    const query = normalized(countryQuery);
    if (!query) return countries;
    return countries.filter((item) =>
      `${item.name} ${item.prefix || ""}`.toLowerCase().includes(query),
    );
  }, [countries, countryQuery]);

  const filteredServices = useMemo(() => {
    const query = normalized(serviceQuery);
    const list = query
      ? services.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(query))
      : [...services].sort((a, b) => serviceRank(a) - serviceRank(b) || a.name.localeCompare(b.name, "id-ID"));
    return list.slice(0, 100);
  }, [services, serviceQuery]);

  const loadReference = useCallback(async () => {
    setReferenceLoading(true);
    try {
      const response = await fetch("/api/nokos/reference", { cache: "no-store" });
      const payload = await parseJson<ReferencePayload>(response);
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Referensi layanan gagal dimuat.");
      }

      const nextCountries = Array.isArray(payload.countries) ? payload.countries : [];
      const nextServices = Array.isArray(payload.services) ? payload.services : [];
      setCountries(nextCountries);
      setServices(nextServices);

      if (nextCountries.length) {
        setCountry((current) => {
          if (nextCountries.some((item) => item.id === current)) return current;
          return (nextCountries.find((item) => item.id === 6) || nextCountries[0]).id;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Referensi layanan gagal dimuat.");
    } finally {
      setReferenceLoading(false);
    }
  }, []);

  const loadActiveOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      const payload = await parseJson<OrdersPayload>(response);
      if (!response.ok || !payload.ok) return;

      const rows = (Array.isArray(payload.orders) ? payload.orders : []).filter(
        (item) =>
          item.supplier === "nokos" &&
          (item.status === "pending" || item.status === "accepted"),
      );
      setActiveOrders(rows);
    } catch {
      // Status order bersifat tambahan; katalog tetap harus bisa dipakai.
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    if (mode === "cheapest" && !selectedService) {
      setProducts([]);
      setTotal(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        mode,
        server,
        page: String(page),
        limit: "24",
        minStock: String(minStock),
        maxPrice: String(maxPrice),
      });

      if (mode === "country") {
        params.set("country", String(country));
        params.set("search", search);
        params.set("sort", countrySort);
      } else if (selectedService) {
        params.set("service", selectedService.code);
        params.set("sort", cheapestSort);
        params.set("region", region);
      }

      const response = await fetch(`/api/nokos/catalog?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await parseJson<CatalogPayload>(response);

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Layanan OTP gagal dimuat.");
      }

      setProducts(Array.isArray(payload.products) ? payload.products : []);
      setTotal(Number(payload.total || 0));
      setTotalPages(Math.max(1, Number(payload.totalPages || 1)));

      if (countries.length === 0 && Array.isArray(payload.countries)) {
        setCountries(payload.countries);
      }
    } catch (err) {
      setProducts([]);
      setTotal(0);
      setTotalPages(1);
      setError(err instanceof Error ? err.message : "Layanan OTP gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [
    mode,
    server,
    page,
    minStock,
    maxPrice,
    country,
    search,
    countrySort,
    selectedService,
    cheapestSort,
    region,
    countries.length,
  ]);

  useEffect(() => {
    void loadReference();
    void loadActiveOrders();
  }, [loadReference, loadActiveOrders]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setActiveQuickFilter("Populer");
  };

  const setCatalogMode = (nextMode: CatalogMode) => {
    setMode(nextMode);
    setPage(1);
    setError("");
  };

  const selectServer = (nextServer: ServerMode) => {
    setServer(nextServer);
    setPage(1);
    setServerModalOpen(false);
    setToast(`Server berpindah ke ${serverLabel(nextServer)}. Daftar layanan dimuat ulang.`);
  };

  const selectCountry = (nextCountry: Country) => {
    setCountry(nextCountry.id);
    setOperator("any");
    setPage(1);
    setCountryModalOpen(false);
    setCountryQuery("");
  };

  const selectOperator = (value: string) => {
    setOperator(value);
    setOperatorModalOpen(false);
  };

  const selectService = (service: Service) => {
    setSelectedService(service);
    setServiceModalOpen(false);
    setServiceQuery("");
    setPage(1);
  };

  const applyQuickFilter = (filter: (typeof quickFilters)[number]) => {
    setActiveQuickFilter(filter);
    setPage(1);

    if (mode === "country") {
      const term = filter === "Populer" ? "" : filter;
      setSearchInput(term);
      setSearch(term);
      if (filter === "Populer") setCountrySort("popular");
      return;
    }

    if (filter === "Populer") {
      setServiceModalOpen(true);
      return;
    }

    const term = normalized(filter);
    const match = services
      .slice()
      .sort((a, b) => serviceRank(a) - serviceRank(b))
      .find((item) => normalized(`${item.name} ${item.code}`).includes(term));
    if (match) {
      setSelectedService(match);
    } else {
      setServiceQuery(filter);
      setServiceModalOpen(true);
    }
  };

  const resetAdvanced = () => {
    setMinStock(0);
    setMaxPrice(0);
    setRegion("all");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed left-1/2 top-24 z-[100001] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-brand-500/30 bg-[#0b1c2f]/95 px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}

      <section className="rounded-[28px] border border-[#17314d] bg-[#06111f] p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h1 className="text-2xl font-black text-white sm:text-3xl">Beli OTP</h1>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            Pilih negara dan layanan untuk memulai aktivasi nomor virtual.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setServerModalOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4 py-3 text-left transition hover:border-brand-500/45"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            ☁
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-black uppercase tracking-[0.15em] text-gray-500">
              Server Pengiriman
            </span>
            <span className="mt-0.5 block text-sm font-black text-white">{serverLabel(server)}</span>
            <span className="block text-[10px] text-gray-500">{serverDescription(server)}</span>
          </span>
          <span className="text-gray-500">⌄</span>
        </button>

        <div className="mt-3 overflow-hidden rounded-2xl border border-[#1b3b5c] bg-[#081726]">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setOrdersOpen((value) => !value)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white">
                ⌛
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-white">Order Aktif</span>
                <span className="block text-[10px] text-gray-500">
                  {activeOrders.length.toLocaleString("id-ID")} sedang menunggu
                </span>
              </span>
              <span className="text-gray-500">{ordersOpen ? "⌃" : "⌄"}</span>
            </button>
            <button
              type="button"
              onClick={() => void loadActiveOrders()}
              disabled={ordersLoading}
              aria-label="Muat ulang order aktif"
              className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
            >
              ↻
            </button>
          </div>

          {ordersOpen && (
            <div className="border-t border-white/[0.06] px-3 py-3">
              {activeOrders.length === 0 ? (
                <p className="px-2 py-2 text-xs text-gray-500">Belum ada order OTP yang aktif.</p>
              ) : (
                <div className="space-y-2">
                  {activeOrders.slice(0, 4).map((order) => (
                    <div
                      key={order.id}
                      className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">
                            {serviceLabel(order.productName || "OTP")}
                          </p>
                          <p className="mt-0.5 text-[10px] text-gray-500">
                            {order.countryName || "Menunggu nomor"} •{" "}
                            {order.status === "accepted" ? "Menunggu OTP" : "Diproses"}
                          </p>
                        </div>
                        <span className="rounded-lg bg-brand-500/10 px-2 py-1 text-[9px] font-black text-brand-500">
                          AKTIF
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href="/notifications"
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-brand-500/25 bg-brand-500/[0.06] px-3 py-2.5 text-xs font-bold text-brand-500"
              >
                Lihat Status & OTP
              </Link>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 rounded-2xl border border-[#1b3b5c] bg-[#030b15] p-1">
          <button
            type="button"
            onClick={() => setCatalogMode("country")}
            className={`rounded-xl px-3 py-3 text-xs font-black transition ${
              mode === "country"
                ? "bg-brand-500 text-white"
                : "text-gray-300 hover:bg-white/[0.04]"
            }`}
          >
            ◉ Per Negara
          </button>
          <button
            type="button"
            onClick={() => setCatalogMode("cheapest")}
            className={`rounded-xl px-3 py-3 text-xs font-black transition ${
              mode === "cheapest"
                ? "bg-brand-500 text-white"
                : "text-gray-300 hover:bg-white/[0.04]"
            }`}
          >
            ▣ Cari Termurah
          </button>
        </div>

        {mode === "country" ? (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => setCountryModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4 py-3 text-left"
            >
              <span className="text-xl">{countryFlag(selectedCountry)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-gray-500">
                  Negara
                </span>
                <span className="block truncate text-sm font-black text-white">
                  {selectedCountry?.name || "Indonesia"}{" "}
                  <span className="font-semibold text-gray-500">{selectedCountry?.prefix || "+62"}</span>
                </span>
              </span>
              <span className="text-gray-500">⌄</span>
            </button>

            <button
              type="button"
              onClick={() => setOperatorModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4 py-3 text-left"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                ⤨
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-gray-500">
                  Operator
                </span>
                <span className="block truncate text-sm font-black text-white">{operatorLabel(operator)}</span>
              </span>
              <span className="text-gray-500">⌄</span>
            </button>

            <form onSubmit={submitSearch}>
              <label className="flex items-center gap-2 rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4">
                <span className="text-gray-500">⌕</span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Cari layanan: WhatsApp, Telegram, Tinder..."
                  className="min-w-0 flex-1 bg-transparent py-3 text-xs text-white outline-none placeholder:text-gray-600"
                />
              </label>
            </form>

            <select
              value={countrySort}
              onChange={(event) => {
                setCountrySort(event.target.value as CountrySort);
                setPage(1);
              }}
              className="w-full appearance-none rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4 py-3 text-xs font-black text-white outline-none"
            >
              {countrySortOptions.map((item) => (
                <option key={item.value} value={item.value} className="bg-[#081726]">
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => setServiceModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4 py-3 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-xs font-black text-brand-500">
                {selectedService ? serviceBadge(selectedService.name) : "▣"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-gray-500">
                  Layanan
                </span>
                <span className="block truncate text-sm font-black text-white">
                  {selectedService?.name || "Pilih layanan untuk cek harga termurah"}
                </span>
              </span>
              <span className="text-gray-500">⌄</span>
            </button>

            <select
              value={cheapestSort}
              onChange={(event) => {
                setCheapestSort(event.target.value as CheapestSort);
                setPage(1);
              }}
              className="w-full appearance-none rounded-2xl border border-[#1b3b5c] bg-[#081726] px-4 py-3 text-xs font-black text-white outline-none"
            >
              {cheapestSortOptions.map((item) => (
                <option key={item.value} value={item.value} className="bg-[#081726]">
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAdvancedOpen((value) => !value)}
          className="mt-2 inline-flex items-center gap-2 px-1 py-2 text-[11px] font-bold text-gray-400 transition hover:text-brand-500"
        >
          ☷ Filter Lanjutan <span>{advancedOpen ? "⌃" : "⌄"}</span>
        </button>

        {advancedOpen && (
          <div className="grid gap-2 rounded-2xl border border-[#1b3b5c] bg-[#050f1b] p-3 sm:grid-cols-2">
            {mode === "cheapest" && (
              <label className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-500">
                Wilayah negara
                <select
                  value={region}
                  onChange={(event) => {
                    setRegion(event.target.value as Region);
                    setPage(1);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#1b3b5c] bg-[#081726] px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none"
                >
                  {regionOptions.map((item) => (
                    <option key={item.value} value={item.value} className="bg-[#081726]">
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-500">
              {mode === "cheapest" ? "Min stok per negara" : "Min stok"}
              <select
                value={minStock}
                onChange={(event) => {
                  setMinStock(Number(event.target.value));
                  setPage(1);
                }}
                className="mt-1.5 w-full rounded-xl border border-[#1b3b5c] bg-[#081726] px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none"
              >
                {minStockOptions.map((item) => (
                  <option key={item.value} value={item.value} className="bg-[#081726]">
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-500">
              Max harga
              <select
                value={maxPrice}
                onChange={(event) => {
                  setMaxPrice(Number(event.target.value));
                  setPage(1);
                }}
                className="mt-1.5 w-full rounded-xl border border-[#1b3b5c] bg-[#081726] px-3 py-2.5 text-xs normal-case tracking-normal text-white outline-none"
              >
                {maxPriceOptions.map((item) => (
                  <option key={item.value} value={item.value} className="bg-[#081726]">
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={resetAdvanced}
              className="self-end rounded-xl border border-brand-500/25 bg-brand-500/[0.06] px-3 py-2.5 text-xs font-bold text-brand-500"
            >
              Reset Filter
            </button>
          </div>
        )}

        <div className="mt-3">
          <p className="mb-2 text-[10px] font-bold text-gray-500">Cek cepat:</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {quickFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => applyQuickFilter(filter)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${
                  activeQuickFilter === filter
                    ? "bg-brand-500/15 text-brand-500"
                    : "bg-white/[0.03] text-gray-400 hover:text-white"
                }`}
              >
                {filter === "Populer" ? "✦ Populer" : filter}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-error-500/20 bg-error-500/10 p-4 text-sm text-error-500">
          {error}
        </div>
      )}

      {loading || referenceLoading ? (
        <div className={mode === "country" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" : "space-y-2"}>
          {Array.from({ length: mode === "country" ? 8 : 7 }).map((_, index) => (
            <div
              key={index}
              className={`${mode === "country" ? "h-44" : "h-24"} animate-pulse rounded-2xl border border-[#17314d] bg-[#06111f]`}
            />
          ))}
        </div>
      ) : mode === "cheapest" && !selectedService ? (
        <section className="rounded-3xl border border-[#17314d] bg-[#06111f] px-5 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] text-2xl text-brand-500">
            ▣
          </div>
          <h2 className="mt-4 text-lg font-black text-white">Pilih layanan dulu</h2>
          <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-gray-500">
            Pilih WhatsApp, Telegram, Instagram, atau layanan lain untuk melihat harga termurah dari semua negara.
          </p>
          <button
            type="button"
            onClick={() => setServiceModalOpen(true)}
            className="mt-5 rounded-xl bg-brand-500 px-5 py-3 text-xs font-black text-white"
          >
            ▣ Pilih Layanan
          </button>
        </section>
      ) : products.length === 0 ? (
        <section className="rounded-3xl border border-[#17314d] bg-[#06111f] px-5 py-12 text-center">
          <h2 className="text-lg font-black text-white">Stok belum tersedia</h2>
          <p className="mt-2 text-xs text-gray-500">
            Coba ubah layanan, negara, server, operator, atau filter.
          </p>
        </section>
      ) : mode === "country" ? (
        <>
          <div className="flex items-center justify-between gap-3 px-1 text-xs text-gray-500">
            <span>{total.toLocaleString("id-ID")} layanan tersedia</span>
            <span>Halaman {page} / {totalPages}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const label = serviceLabel(product.name);
              const hot = isPopularService(label);
              return (
                <article
                  key={product.id}
                  className="relative min-w-0 rounded-2xl border border-[#17314d] bg-[#06111f] p-3 shadow-sm transition hover:border-brand-500/40"
                >
                  {hot && (
                    <span className="absolute right-2 top-2 rounded-md bg-brand-500 px-1.5 py-0.5 text-[8px] font-black text-white">
                      HOT
                    </span>
                  )}

                  <div className="flex min-w-0 items-center gap-2 pr-7">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/[0.08] text-xs font-black text-brand-500">
                      {serviceBadge(label)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 text-xs font-black leading-4 text-white">{label}</h2>
                      <p className="mt-0.5 truncate text-[9px] text-gray-500">
                        {Number(product.stock).toLocaleString("id-ID")} stok{product.nokosServer ? ` • ${product.nokosServer === "s1" ? "Express" : "Plus"}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div>
                      <p className="text-sm font-black text-brand-500">{formatRupiah(product.price)}</p>
                      <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-500">
                        Harga API • {product.nokosServer === "s1" ? "Express" : "Plus"}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-500">
                      Harga API • {product.nokosServer === "s1" ? "Express" : "Plus"}
                    </p>
                  </div>
                  <NokosBuyButton
                    compact
                    productId={product.id}
                    productName={product.name}
                    price={product.price}
                    stock={product.stock}
                    operator={operator}
                  />
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 px-1 text-xs text-gray-500">
            <span>{total.toLocaleString("id-ID")} negara tersedia</span>
            <span>Halaman {page} / {totalPages}</span>
          </div>

          <div className="space-y-2">
            {products.map((product, index) => {
              const name = product.nokosCountryName || product.name.split(" - ").slice(-1)[0] || "Negara";
              return (
                <article
                  key={product.id}
                  className={`rounded-2xl border bg-[#06111f] px-3 py-3 ${
                    index === 0 ? "border-brand-500/70 shadow-[0_0_0_1px_rgba(70,149,255,0.08)]" : "border-[#17314d]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{countryFlag(name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-black text-white">{name}</h2>
                        {product.nokosCountryPrefix && (
                          <span className="text-[10px] font-bold text-gray-500">{product.nokosCountryPrefix}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {Number(product.stock).toLocaleString("id-ID")} stok{product.nokosServer ? ` • ${product.nokosServer === "s1" ? "Express" : "Plus"}` : ""}
                      </p>
                    </div>
                    {index === 0 && (
                      <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[8px] font-black text-white">
                        TERMURAH
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-sm font-black text-brand-500">{formatRupiah(product.price)}</p>
                    <div className="w-[132px] max-w-[48%]">
                      <NokosBuyButton
                        compact
                        productId={product.id}
                        productName={product.name}
                        price={product.price}
                        stock={product.stock}
                        operator="any"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {totalPages > 1 && products.length > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded-xl border border-[#17314d] bg-[#06111f] px-4 py-2.5 text-xs font-bold text-gray-300 disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-xl border border-[#17314d] bg-[#06111f] px-4 py-2.5 text-xs font-bold text-gray-300 disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      )}

      {serverModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-[#1b3b5c] bg-[#071321] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Pilih Server Pengiriman</h3>
                <p className="mt-1 text-xs text-gray-500">Pilih jaringan yang dipakai untuk mengambil & menerima OTP.</p>
              </div>
              <button
                type="button"
                onClick={() => setServerModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-brand-500/15 bg-brand-500/[0.05] p-3 text-[10px] leading-5 text-gray-400">
              Pilih Server Plus atau Server Express. Harga dan stok diambil dari API provider untuk server yang dipilih. Saat checkout harga dan stok diperiksa ulang sebelum saldo dipotong.
            </div>

            <div className="mt-3 space-y-3">
              {([
                {
                  value: "s2" as ServerMode,
                  name: "Server Plus",
                  badge: "",
                  description: "Pilihan manual • Server Plus",
                  detail: "Kunci pembelian hanya ke Server Plus tanpa membandingkan Server Express.",
                  icon: "☁",
                },
                {
                  value: "s1" as ServerMode,
                  name: "Server Express",
                  badge: "",
                  description: "Pilihan manual • Server Express",
                  detail: "Kunci pembelian hanya ke Server Express tanpa membandingkan Server Plus.",
                  icon: "⚡",
                },
              ]).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectServer(item.value)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    server === item.value
                      ? "border-brand-500 bg-brand-500/[0.06]"
                      : "border-[#1b3b5c] bg-[#081726] hover:border-brand-500/35"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-white">{item.name}</span>
                        {item.badge && (
                          <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[8px] font-black text-brand-500">
                            {item.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold text-gray-400">{item.description}</span>
                      <span className="mt-2 block text-[10px] leading-5 text-gray-500">{item.detail}</span>
                    </span>
                    {server === item.value && <span className="text-brand-500">●</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {countryModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[82vh] w-full max-w-md flex-col rounded-[28px] border border-[#1b3b5c] bg-[#071321] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Pilih Negara</h3>
                <p className="mt-1 text-xs text-gray-500">{countries.length.toLocaleString("id-ID")} negara tersedia</p>
              </div>
              <button
                type="button"
                onClick={() => setCountryModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] text-gray-400"
              >
                ×
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 rounded-xl border border-brand-500/45 bg-[#081726] px-3">
              <span className="text-gray-500">⌕</span>
              <input
                autoFocus
                value={countryQuery}
                onChange={(event) => setCountryQuery(event.target.value)}
                placeholder="Cari negara..."
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-gray-600"
              />
            </label>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-1.5">
                {filteredCountries.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCountry(item)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                      country === item.id
                        ? "border-brand-500 bg-brand-500/[0.07]"
                        : "border-white/[0.05] bg-[#06111f]"
                    }`}
                  >
                    <span className="text-xl">{countryFlag(item)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">{item.name}</span>
                      <span className="block text-[10px] text-gray-500">{item.prefix || ""}</span>
                    </span>
                    {country === item.id && <span className="text-brand-500">●</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {operatorModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-[#1b3b5c] bg-[#071321] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Pilih Operator</h3>
                <p className="mt-1 text-xs text-gray-500">{operatorOptions.length} operator tersedia</p>
              </div>
              <button
                type="button"
                onClick={() => setOperatorModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-warning-500/20 bg-warning-500/10 p-3 text-[10px] leading-5 text-warning-500">
              Pilih <b>Any</b> untuk hasil tercepat. Operator spesifik bisa membuat stok lebih sedikit atau tidak tersedia.
            </div>

            <div className="mt-3 space-y-2">
              {operatorOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectOperator(item.value)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                    operator === item.value
                      ? "border-brand-500 bg-brand-500/[0.07]"
                      : "border-white/[0.05] bg-[#06111f]"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                    ⌁
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white">{item.label}</span>
                    <span className="block text-[10px] text-gray-500">{item.subtitle}</span>
                  </span>
                  {operator === item.value && <span className="text-brand-500">●</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {serviceModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[82vh] w-full max-w-md flex-col rounded-[28px] border border-[#1b3b5c] bg-[#071321] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Pilih Layanan</h3>
                <p className="mt-1 text-xs text-gray-500">Akan tampil semua negara + harga termurah</p>
              </div>
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] text-gray-400"
              >
                ×
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 rounded-xl border border-brand-500/45 bg-[#081726] px-3">
              <span className="text-gray-500">⌕</span>
              <input
                autoFocus
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Cari layanan: WhatsApp, Telegram..."
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-gray-600"
              />
            </label>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-1.5">
                {filteredServices.map((item) => {
                  const hot = isPopularService(item.name);
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => selectService(item)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                        selectedService?.code === item.code
                          ? "border-brand-500 bg-brand-500/[0.07]"
                          : "border-white/[0.05] bg-[#06111f]"
                      }`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/[0.08] text-xs font-black text-brand-500">
                        {serviceBadge(item.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{item.name}</span>
                        <span className="block text-[10px] uppercase text-gray-500">{item.code}</span>
                      </span>
                      {hot && (
                        <span className="rounded-md bg-brand-500 px-1.5 py-0.5 text-[8px] font-black text-white">
                          HOT
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
