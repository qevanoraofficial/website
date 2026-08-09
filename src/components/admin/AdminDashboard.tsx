"use client";

import Image from "next/image";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Product, TransactionTestimonial } from "@/types/catalog";
import type { VisitorSummary } from "@/lib/visitor-stats";
import type { MemberSummary } from "@/lib/member-stats";

type DashboardTab = "summary" | "products" | "testimonials";

type AdminDashboardProps = {
  initialProducts: Product[];
  initialTestimonials: TransactionTestimonial[];
  initialVisitorSummary: VisitorSummary;
  initialMemberSummary: MemberSummary;
  initialError?: string;
};

type RequestState = {
  type: "success" | "error";
  message: string;
} | null;

const inputClass =
  "h-12 w-full rounded-xl border border-brand-500/20 bg-[#020b18] px-4 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-brand-400";
const textareaClass =
  "min-h-28 w-full resize-y rounded-xl border border-brand-500/20 bg-[#020b18] px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-brand-400";
const labelClass = "mb-2 block text-sm font-semibold text-[#f7e6a8]";

function formatRupiah(value: number | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function safeImage(image?: string): string {
  return image || "/images/products/product-placeholder.svg";
}

function tabFromHash(hash: string): DashboardTab {
  if (
    hash === "add-product" ||
    hash === "delete-product" ||
    hash === "add-stock"
  ) {
    return "products";
  }

  if (hash === "add-testimonial" || hash === "delete-testimonial") {
    return "testimonials";
  }

  return "summary";
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok || payload.ok === false) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Permintaan gagal diproses.",
    );
  }

  return payload;
}

type MetricIconName =
  | "visitors"
  | "guests"
  | "members"
  | "conversion"
  | "today"
  | "products"
  | "testimonials"
  | "stock";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.max(0, value || 0));
}

function formatPercent(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

function formatMemberDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function maskWhatsApp(value: string): string {
  const normalized = String(value || "").replace(/\s+/g, "");

  if (normalized.length <= 6) {
    return normalized || "-";
  }

  return `${normalized.slice(0, 4)}••••${normalized.slice(-3)}`;
}

function MetricIcon({ name }: { name: MetricIconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  } as const;

  if (name === "members") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "guests") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "conversion") {
    return (
      <svg {...common}>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "products") {
    return (
      <svg {...common}>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m4 7v10l8 4 8-4V7M12 11v10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "testimonials") {
    return (
      <svg {...common}>
        <path d="M4 5h16v12H8l-4 4V5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "stock") {
    return (
      <svg {...common}>
        <path d="M3 7h18M5 7v13h14V7M8 3h8l2 4H6l2-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "today") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
  badge,
}: {
  label: string;
  value: string;
  description: string;
  icon: MetricIconName;
  badge?: string;
}) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-3xl border border-brand-500/15 bg-gradient-to-br from-white/[0.045] to-white/[0.015] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] transition hover:border-brand-400/30">
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            {label}
          </p>
          <p className="mt-3 truncate text-3xl font-bold text-white sm:text-4xl">
            {value}
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-brand-300">
          <MetricIcon name={icon} />
        </span>
      </div>
      <div className="relative mt-4 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 text-xs leading-5 text-gray-500">{description}</p>
        {badge && (
          <span className="shrink-0 rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-200">
            {badge}
          </span>
        )}
      </div>
    </article>
  );
}

export default function AdminDashboard({
  initialProducts,
  initialTestimonials,
  initialVisitorSummary,
  initialMemberSummary,
  initialError,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("summary");
  const [products, setProducts] = useState(initialProducts);
  const [testimonials, setTestimonials] = useState(initialTestimonials);
  const [visitorSummary] = useState(initialVisitorSummary);
  const [memberSummary] = useState(initialMemberSummary);
  const [requestState, setRequestState] = useState<RequestState>(
    initialError ? { type: "error", message: initialError } : null,
  );
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    const synchronizeTabFromHash = () => {
      const hash = window.location.hash.slice(1) || "summary";
      setActiveTab(tabFromHash(hash));

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(hash)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
    };

    synchronizeTabFromHash();
    window.addEventListener("hashchange", synchronizeTabFromHash);

    return () =>
      window.removeEventListener("hashchange", synchronizeTabFromHash);
  }, []);


  const websiteMetrics = useMemo(() => {
    const activeProducts = products.filter(
      (product) => product.active !== false,
    ).length;
    const totalStock = products.reduce(
      (total, product) => total + Math.max(0, Number(product.stock) || 0),
      0,
    );
    const outOfStock = products.filter(
      (product) => Math.max(0, Number(product.stock) || 0) === 0,
    ).length;
    const conversionRate =
      visitorSummary.totalVisitors > 0
        ? Math.min(
            100,
            (memberSummary.totalMembers / visitorSummary.totalVisitors) * 100,
          )
        : 0;
    const memberTrafficShare =
      visitorSummary.totalVisitors > 0
        ? Math.min(
            100,
            (visitorSummary.totalMemberVisitors /
              visitorSummary.totalVisitors) *
              100,
          )
        : 0;
    const todayGrowth =
      visitorSummary.yesterdayVisitors > 0
        ? ((visitorSummary.todayVisitors -
            visitorSummary.yesterdayVisitors) /
            visitorSummary.yesterdayVisitors) *
          100
        : visitorSummary.todayVisitors > 0
          ? 100
          : 0;

    return {
      activeProducts,
      totalStock,
      outOfStock,
      conversionRate,
      memberTrafficShare,
      todayGrowth,
    };
  }, [products, memberSummary.totalMembers, visitorSummary]);

  const maxDailyTraffic = useMemo(
    () =>
      Math.max(
        1,
        ...visitorSummary.last7Days.map((item) => item.visitors),
      ),
    [visitorSummary.last7Days],
  );

  const memberRegistrationLookup = useMemo(
    () =>
      new Map(
        memberSummary.last7Days.map((item) => [item.date, item.members]),
      ),
    [memberSummary.last7Days],
  );

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyAction("add-product");
    setRequestState(null);

    try {
      const response = await fetch("/api/qevanora-admin/products", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });
      const payload = await readPayload(response);
      const product = payload.product as Product;

      setProducts((current) => [
        product,
        ...current.filter((item) => item.id !== product.id),
      ]);
      form.reset();
      setRequestState({
        type: "success",
        message: "Produk berhasil ditambahkan.",
      });
    } catch (error) {
      setRequestState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Produk gagal ditambahkan.",
      });
    } finally {
      setBusyAction("");
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Hapus produk “${product.name}”?`)) {
      return;
    }

    setBusyAction(`delete-product-${product.id}`);
    setRequestState(null);

    try {
      const response = await fetch(
        `/api/qevanora-admin/products?id=${encodeURIComponent(product.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      await readPayload(response);
      setProducts((current) =>
        current.filter((item) => item.id !== product.id),
      );
      setRequestState({
        type: "success",
        message: "Produk berhasil dihapus.",
      });
    } catch (error) {
      setRequestState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Produk gagal dihapus.",
      });
    } finally {
      setBusyAction("");
    }
  }

  async function addStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyAction("add-stock");
    setRequestState(null);

    try {
      const response = await fetch("/api/qevanora-admin/products", {
        method: "PATCH",
        body: new FormData(form),
        credentials: "same-origin",
      });
      const payload = await readPayload(response);
      const product = payload.product as Product;

      setProducts((current) =>
        current.map((item) => (item.id === product.id ? product : item)),
      );
      form.reset();
      setRequestState({
        type: "success",
        message: `Stok ${product.name} berhasil diubah menjadi ${Number(product.stock) || 0}.`,
      });
    } catch (error) {
      setRequestState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Stok gagal diperbarui.",
      });
    } finally {
      setBusyAction("");
    }
  }

  async function addTestimonial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyAction("add-testimonial");
    setRequestState(null);

    try {
      const response = await fetch("/api/qevanora-admin/testimonials", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });
      const payload = await readPayload(response);
      const testimonial = payload.testimonial as TransactionTestimonial;

      setTestimonials((current) => [
        testimonial,
        ...current.filter((item) => item.id !== testimonial.id),
      ]);
      form.reset();
      setRequestState({
        type: "success",
        message: "Testimoni berhasil ditambahkan.",
      });
    } catch (error) {
      setRequestState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Testimoni gagal ditambahkan.",
      });
    } finally {
      setBusyAction("");
    }
  }

  async function deleteTestimonial(testimonial: TransactionTestimonial) {
    if (!window.confirm(`Hapus testimoni “${testimonial.productName}”?`)) {
      return;
    }

    setBusyAction(`delete-testimonial-${testimonial.id}`);
    setRequestState(null);

    try {
      const response = await fetch(
        `/api/qevanora-admin/testimonials?id=${encodeURIComponent(
          testimonial.id,
        )}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      await readPayload(response);
      setTestimonials((current) =>
        current.filter((item) => item.id !== testimonial.id),
      );
      setRequestState({
        type: "success",
        message: "Testimoni berhasil dihapus.",
      });
    } catch (error) {
      setRequestState({
        type: "error",
        message:
          error instanceof Error ? error.message : "Testimoni gagal dihapus.",
      });
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="w-full min-w-0 text-white">
      <section className="rounded-3xl border border-brand-500/15 bg-white/[0.025] p-5 shadow-theme-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.24em] text-brand-300">
              QEVANORA OFFICIAL
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Admin Panel</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Pantau performa website, pengunjung, anggota, produk, dan testimoni secara terpusat.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-500/25 px-3 text-xs font-semibold text-brand-100 transition hover:bg-brand-500/10 sm:px-4 sm:text-sm"
            >
              Website
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-brand-500/25 px-3 text-xs font-semibold text-brand-100 transition hover:bg-brand-500/10 sm:px-4 sm:text-sm"
            >
              Muat Ulang
            </button>
            <form action="/api/qevanora-admin/logout" method="post" className="min-w-0">
              <button
                type="submit"
                className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-brand-500 px-3 text-xs font-semibold text-[#031126] transition hover:bg-brand-400 sm:px-4 sm:text-sm"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </section>

        {requestState && (
          <div
            role="status"
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
              requestState.type === "success"
                ? "border-success-500/30 bg-success-500/10 text-success-300"
                : "border-error-500/30 bg-error-500/10 text-error-300"
            }`}
          >
            {requestState.message}
          </div>
        )}



        {activeTab === "summary" && (
          <section id="summary" className="mt-6 space-y-6 scroll-mt-24">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total Pengunjung"
                value={formatNumber(visitorSummary.totalVisitors)}
                description="Seluruh sesi unik yang tercatat di website."
                icon="visitors"
                badge={`${visitorSummary.todayVisitors} hari ini`}
              />
              <MetricCard
                label="Pengunjung Biasa"
                value={formatNumber(visitorSummary.totalGuestVisitors)}
                description="Pengunjung yang belum memiliki akun anggota."
                icon="guests"
                badge={`${visitorSummary.todayGuestVisitors} hari ini`}
              />
              <MetricCard
                label="Anggota Terdaftar"
                value={formatNumber(memberSummary.totalMembers)}
                description="Akun pelanggan unik yang sudah mendaftar."
                icon="members"
                badge={`+${memberSummary.newMembersToday} hari ini`}
              />
              <MetricCard
                label="Konversi Anggota"
                value={formatPercent(websiteMetrics.conversionRate)}
                description="Perbandingan anggota terdaftar terhadap pengunjung."
                icon="conversion"
                badge={`${memberSummary.newMembers7Days} / 7 hari`}
              />
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
              <article className="min-w-0 overflow-hidden rounded-3xl border border-brand-500/15 bg-[#031126] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.2)] sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
                      Analitik Pengunjung
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">
                      Aktivitas tujuh hari terakhir
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Perbandingan pengunjung biasa dan kunjungan anggota.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
                      Pengunjung biasa
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#d7efff]" />
                      Anggota
                    </span>
                  </div>
                </div>

                {visitorSummary.last7Days.length > 0 ? (
                  <div className="mt-8 grid h-64 grid-cols-7 items-end gap-2 sm:gap-4">
                    {visitorSummary.last7Days.map((item) => {
                      const guestHeight = Math.max(
                        item.guests > 0 ? 4 : 0,
                        Math.round((item.guests / maxDailyTraffic) * 176),
                      );
                      const memberHeight = Math.max(
                        item.members > 0 ? 4 : 0,
                        Math.round((item.members / maxDailyTraffic) * 176),
                      );
                      const registrations =
                        memberRegistrationLookup.get(item.date) || 0;

                      return (
                        <div
                          key={item.date}
                          className="flex min-w-0 flex-col items-center justify-end gap-2"
                          title={`${item.label}: ${item.visitors} pengunjung, ${registrations} anggota baru`}
                        >
                          <span className="text-[10px] font-semibold text-gray-400 sm:text-xs">
                            {item.visitors}
                          </span>
                          <div className="flex h-44 w-full max-w-12 items-end justify-center overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.025] px-1.5 pt-2">
                            <div className="flex w-full flex-col justify-end overflow-hidden rounded-lg">
                              <div
                                className="w-full bg-[#d7efff] transition-all"
                                style={{ height: memberHeight }}
                              />
                              <div
                                className="w-full bg-gradient-to-t from-brand-700 to-brand-400 transition-all"
                                style={{ height: guestHeight }}
                              />
                            </div>
                          </div>
                          <span className="max-w-full truncate text-[9px] text-gray-600 sm:text-[11px]">
                            {item.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-8 flex h-64 items-center justify-center rounded-2xl border border-dashed border-brand-500/20 text-sm text-gray-500">
                    Statistik pengunjung belum tersedia.
                  </div>
                )}
              </article>

              <article className="min-w-0 rounded-3xl border border-brand-500/15 bg-gradient-to-br from-[#061a35] to-[#020b18] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.2)] sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
                  Komposisi Audiens
                </p>
                <h2 className="mt-2 text-xl font-bold text-white">
                  Status pengunjung
                </h2>

                <div className="mt-7 flex flex-col items-center">
                  <div
                    className="relative flex h-44 w-44 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(#d6a62f 0 ${100 - websiteMetrics.memberTrafficShare}%, #d7efff ${100 - websiteMetrics.memberTrafficShare}% 100%)`,
                    }}
                  >
                    <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-brand-500/10 bg-[#031126] text-center">
                      <span className="text-3xl font-bold text-white">
                        {formatPercent(websiteMetrics.memberTrafficShare)}
                      </span>
                      <span className="mt-1 text-xs text-gray-500">
                        kunjungan anggota
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-brand-500/10 bg-white/[0.025] p-4">
                    <p className="text-xs text-gray-500">Biasa</p>
                    <p className="mt-1 text-xl font-bold text-brand-300">
                      {formatNumber(visitorSummary.totalGuestVisitors)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-brand-500/10 bg-white/[0.025] p-4">
                    <p className="text-xs text-gray-500">Anggota</p>
                    <p className="mt-1 text-xl font-bold text-[#d7efff]">
                      {formatNumber(visitorSummary.totalMemberVisitors)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-brand-500/10 bg-brand-500/[0.05] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-400">Pengunjung hari ini</span>
                    <span className="font-bold text-white">
                      {formatNumber(visitorSummary.todayVisitors)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-400">Perubahan harian</span>
                    <span
                      className={`font-semibold ${
                        websiteMetrics.todayGrowth >= 0
                          ? "text-success-400"
                          : "text-error-400"
                      }`}
                    >
                      {websiteMetrics.todayGrowth >= 0 ? "+" : ""}
                      {websiteMetrics.todayGrowth.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </article>
            </div>

            <article className="rounded-3xl border border-brand-500/15 bg-white/[0.025] p-5 sm:p-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
                    Statistik Website
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    Ringkasan konten dan katalog
                  </h2>
                </div>
                <p className="text-xs text-gray-600">
                  Data diperbarui dari penyimpanan website.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Produk"
                  value={formatNumber(products.length)}
                  description={`${websiteMetrics.activeProducts} produk aktif`}
                  icon="products"
                  badge={`${websiteMetrics.outOfStock} habis`}
                />
                <MetricCard
                  label="Total Stok"
                  value={formatNumber(websiteMetrics.totalStock)}
                  description="Akumulasi stok seluruh produk."
                  icon="stock"
                />
                <MetricCard
                  label="Testimoni"
                  value={formatNumber(testimonials.length)}
                  description="Bukti transaksi yang ditampilkan."
                  icon="testimonials"
                />
                <MetricCard
                  label="Anggota Baru"
                  value={formatNumber(memberSummary.newMembers7Days)}
                  description="Pendaftaran dalam tujuh hari terakhir."
                  icon="today"
                  badge={`+${memberSummary.newMembersToday} hari ini`}
                />
              </div>
            </article>

            <article className="min-w-0 overflow-hidden rounded-3xl border border-brand-500/15 bg-[#031126] shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
              <div className="flex flex-col gap-2 border-b border-brand-500/10 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
                    Anggota Terbaru
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-white">
                    Pendaftaran pelanggan terbaru
                  </h2>
                </div>
                <span className="text-xs text-gray-600">
                  Total {formatNumber(memberSummary.totalMembers)} anggota
                </span>
              </div>

              {memberSummary.recentMembers.length > 0 ? (
                <div className="divide-y divide-brand-500/10">
                  {memberSummary.recentMembers.map((member, index) => (
                    <div
                      key={member.accountId}
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(140px,0.55fr)_auto] sm:px-7"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-sm font-bold text-brand-200">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {member.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-600">
                          ID {member.accountId.slice(0, 12)}
                        </p>
                      </div>
                      <div className="hidden min-w-0 sm:block">
                        <p className="truncate text-sm text-gray-400">
                          {maskWhatsApp(member.whatsapp)}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-600">
                          {member.telegram || "Telegram belum diisi"}
                        </p>
                      </div>
                      <p className="col-start-2 text-xs text-gray-600 sm:col-start-auto sm:text-right">
                        {formatMemberDate(member.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center text-sm text-gray-500">
                  Belum ada anggota yang tercatat. Data akan masuk saat pelanggan menyimpan profil.
                </div>
              )}
            </article>
          </section>
        )}

        {activeTab === "products" && (
          <section className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0 space-y-6">
              <form
                id="add-product"
                onSubmit={addProduct}
                className="scroll-mt-24 h-fit min-w-0 rounded-3xl border border-brand-500/15 bg-[#031126] p-5 sm:p-7"
              >
              <p className="text-sm font-semibold text-brand-300">
                Tambah Produk
              </p>
              <h2 className="mt-1 text-xl font-bold">Produk baru</h2>

              <div className="mt-5 space-y-4">
                <label>
                  <span className={labelClass}>Nama produk</span>
                  <input
                    name="name"
                    required
                    maxLength={160}
                    className={inputClass}
                    placeholder="Nama produk"
                  />
                </label>

                <label>
                  <span className={labelClass}>Kategori</span>
                  <input
                    name="categoryName"
                    required
                    maxLength={120}
                    className={inputClass}
                    placeholder="Contoh: Minecraft Addon"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>Harga</span>
                    <input
                      name="price"
                      required
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Stok</span>
                    <input
                      name="stock"
                      required
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder="0"
                    />
                  </label>
                </div>

                <label>
                  <span className={labelClass}>Deskripsi singkat</span>
                  <textarea
                    name="shortDescription"
                    required
                    maxLength={1000}
                    className={textareaClass}
                    placeholder="Ringkasan produk"
                  />
                </label>

                <label>
                  <span className={labelClass}>Deskripsi lengkap</span>
                  <textarea
                    name="fullDescription"
                    required
                    maxLength={6000}
                    className={`${textareaClass} min-h-40`}
                    placeholder="Detail lengkap produk"
                  />
                </label>

                <label>
                  <span className={labelClass}>Gambar produk</span>
                  <input
                    name="image"
                    required
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block w-full rounded-xl border border-brand-500/20 bg-[#020b18] p-3 text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:font-semibold file:text-[#031126]"
                  />
                  <span className="mt-2 block text-xs text-gray-600">
                    JPG, PNG, atau WEBP. Maksimal 4 MB.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={busyAction === "add-product"}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-[#031126] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === "add-product"
                  ? "Menyimpan..."
                  : "Tambah Produk"}
              </button>
              </form>

              <form
                id="add-stock"
                onSubmit={addStock}
                className="scroll-mt-24 h-fit min-w-0 rounded-3xl border border-brand-500/15 bg-[#031126] p-5 sm:p-7"
              >
                <p className="text-sm font-semibold text-brand-300">
                  Edit Stock
                </p>
                <h2 className="mt-1 text-xl font-bold">Ubah stok produk</h2>

                <div className="mt-5 space-y-4">
                  <label>
                    <span className={labelClass}>Pilih produk</span>
                    <select
                      name="id"
                      required
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="" disabled>
                        Pilih produk
                      </option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} — stok {Number(product.stock) || 0}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className={labelClass}>Stock baru</span>
                    <input
                      name="stock"
                      required
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder="Contoh: 10"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={busyAction === "add-stock" || products.length === 0}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-[#031126] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === "add-stock"
                    ? "Menyimpan..."
                    : "Simpan Stock"}
                </button>
              </form>
            </div>

            <div id="delete-product" className="scroll-mt-24 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-brand-300">
                    Daftar Produk
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    {products.length} produk
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                {products.map((product) => (
                  <article
                    key={product.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-brand-500/15 bg-white/[0.025]"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#031126]">
                      <Image
                        src={safeImage(product.image)}
                        alt={`Gambar ${product.name}`}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <p className="truncate text-xs font-semibold text-brand-300">
                        {product.categoryName}
                      </p>
                      <h3 className="mt-2 truncate font-semibold text-white">
                        {product.name}
                      </h3>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-brand-100">
                          {formatRupiah(product.price)}
                        </span>
                        <span className="text-gray-500">
                          Stok {product.stock}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteProduct(product)}
                        disabled={
                          busyAction === `delete-product-${product.id}`
                        }
                        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-error-500/30 bg-error-500/10 px-4 text-sm font-semibold text-error-300 transition hover:bg-error-500/20 disabled:opacity-60"
                      >
                        {busyAction === `delete-product-${product.id}`
                          ? "Menghapus..."
                          : "Hapus Produk"}
                      </button>
                    </div>
                  </article>
                ))}

                {products.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-brand-500/20 p-8 text-center text-sm text-gray-500 md:col-span-2">
                    Belum ada produk.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "testimonials" && (
          <section className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <form
              id="add-testimonial"
              onSubmit={addTestimonial}
              className="scroll-mt-24 h-fit min-w-0 rounded-3xl border border-brand-500/15 bg-[#031126] p-5 sm:p-7"
            >
              <p className="text-sm font-semibold text-brand-300">
                Tambah Testimoni
              </p>
              <h2 className="mt-1 text-xl font-bold">Testimoni baru</h2>

              <div className="mt-5 space-y-4">
                <label>
                  <span className={labelClass}>Nama pelanggan</span>
                  <input
                    name="name"
                    required
                    maxLength={120}
                    className={inputClass}
                    placeholder="Nama pelanggan"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>Telegram</span>
                    <input
                      name="telegram"
                      maxLength={120}
                      className={inputClass}
                      placeholder="Opsional"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>WhatsApp</span>
                    <input
                      name="whatsapp"
                      maxLength={80}
                      className={inputClass}
                      placeholder="Opsional"
                    />
                  </label>
                </div>

                <label>
                  <span className={labelClass}>Nama produk</span>
                  <input
                    name="productName"
                    required
                    maxLength={180}
                    className={inputClass}
                    placeholder="Produk yang dibeli"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>Harga produk</span>
                    <input
                      name="productPrice"
                      required
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Jumlah beli</span>
                    <input
                      name="quantity"
                      required
                      type="number"
                      min="1"
                      step="1"
                      className={inputClass}
                      placeholder="1"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label>
                    <span className={labelClass}>Total harga</span>
                    <input
                      name="totalPrice"
                      required
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Metode pembayaran</span>
                    <input
                      name="payment"
                      required
                      maxLength={100}
                      className={inputClass}
                      placeholder="Contoh: DANA"
                    />
                  </label>
                </div>

                <label>
                  <span className={labelClass}>Tanggal pembelian</span>
                  <input
                    name="purchaseDate"
                    required
                    type="date"
                    className={inputClass}
                  />
                </label>

                <label>
                  <span className={labelClass}>Bukti testimoni</span>
                  <input
                    name="image"
                    required
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block w-full rounded-xl border border-brand-500/20 bg-[#020b18] p-3 text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:font-semibold file:text-[#031126]"
                  />
                  <span className="mt-2 block text-xs text-gray-600">
                    JPG, PNG, atau WEBP. Maksimal 4 MB.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={busyAction === "add-testimonial"}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand-500 px-5 text-sm font-semibold text-[#031126] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === "add-testimonial"
                  ? "Menyimpan..."
                  : "Tambah Testimoni"}
              </button>
            </form>

            <div id="delete-testimonial" className="scroll-mt-24 min-w-0">
              <div>
                <p className="text-sm font-semibold text-brand-300">
                  Daftar Testimoni
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {testimonials.length} testimoni
                </h2>
              </div>

              <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                {testimonials.map((testimonial) => (
                  <article
                    key={testimonial.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-brand-500/15 bg-white/[0.025]"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#031126]">
                      <Image
                        src={safeImage(testimonial.image)}
                        alt={`Testimoni ${testimonial.productName}`}
                        fill
                        unoptimized
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <p className="truncate text-xs font-semibold text-success-400">
                        TRANSAKSI SUKSES
                      </p>
                      <h3 className="mt-2 truncate font-semibold text-white">
                        {testimonial.productName}
                      </h3>
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {testimonial.name || "Pelanggan"}
                      </p>
                      <p className="mt-3 font-semibold text-brand-100">
                        {formatRupiah(testimonial.totalPrice)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void deleteTestimonial(testimonial)}
                        disabled={
                          busyAction ===
                          `delete-testimonial-${testimonial.id}`
                        }
                        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-error-500/30 bg-error-500/10 px-4 text-sm font-semibold text-error-300 transition hover:bg-error-500/20 disabled:opacity-60"
                      >
                        {busyAction ===
                        `delete-testimonial-${testimonial.id}`
                          ? "Menghapus..."
                          : "Hapus Testimoni"}
                      </button>
                    </div>
                  </article>
                ))}

                {testimonials.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-brand-500/20 p-8 text-center text-sm text-gray-500 md:col-span-2">
                    Belum ada testimoni.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
    </main>
  );
}
