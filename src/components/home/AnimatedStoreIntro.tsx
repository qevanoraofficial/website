"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Product, TransactionTestimonial } from "@/types/catalog";
import { getProductCategories } from "@/lib/products";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  hero?: boolean;
};

type StoreLink = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
};

function Reveal({ children, className = "", delay = 0, hero = false }: RevealProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.unobserve(entry.target);
      },
      {
        threshold: hero ? 0.04 : 0.16,
        rootMargin: hero ? "0px" : "0px 0px -8% 0px",
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hero]);

  return (
    <div
      ref={elementRef}
      style={{ "--qev-section-delay": `${delay}ms` } as CSSProperties}
      className={`${className} qev-reference-reveal ${hero ? "qev-reference-hero" : ""} ${
        isVisible ? "qev-reference-visible" : ""
      }`}
    >
      {children}
    </div>
  );
}

function formatRupiah(value: number | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function shortText(product: Product): string {
  const text = String(
    product.shortDescription || product.description || "",
  ).trim();

  return text || "Produk digital pilihan dari QEVANORA OFFICIAL.";
}

function IconBox({ children }: { children: ReactNode }) {
  return (
    <span className="qevanora-icon-box flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
      {children}
    </span>
  );
}

const quickLinks: StoreLink[] = [
  {
    title: "Produk",
    description: "Temukan produk digital sesuai kebutuhanmu.",
    href: "#produk-terbaru",
    icon: (
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="m4.4 7.7 7.6 4.2 7.6-4.2M12 12v8.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Testimoni",
    description: "Lihat bukti transaksi dari pelanggan.",
    href: "/testimonials",
    icon: (
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M5 5.5h14v10H9l-4 3v-13Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 9h6M9 12h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Support",
    description: "Hubungi layanan bantuan resmi QEVANORA OFFICIAL.",
    href: "/support",
    icon: (
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 13v-2a8 8 0 0 1 16 0v2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4 13h3v5H5.5A1.5 1.5 0 0 1 4 16.5V13ZM20 13h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5V13ZM17 19c-.7 1.2-2.1 2-4 2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    title: "Privasi",
    description: "Pelajari cara data pelanggan dilindungi.",
    href: "/privacy",
    icon: (
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 9v4M12 16h.01"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Disclaimer",
    description: "Baca ketentuan dan batasan layanan.",
    href: "/disclaimer",
    icon: (
      <svg
        width="25"
        height="25"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 8v5M12 16h.01"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const benefits = [
  {
    title: "Proses Praktis",
    description: "Pilih produk, kirim order, lalu pantau statusnya.",
  },
  {
    title: "Transaksi Transparan",
    description: "Harga dan stok produk ditampilkan dengan jelas.",
  },
  {
    title: "Dukungan Resmi",
    description: "Bantuan tersedia melalui WhatsApp dan Telegram resmi.",
  },
];

const marqueeText =
  "Percayakan kebutuhan digital Anda kepada QEVANORA OFFICIAL — solusi belanja produk digital yang terpercaya, berkualitas, dan siap memberikan pengalaman terbaik bagi setiap pelanggan.";

const trustMarqueeItems = [
  "Aman",
  "Cepat",
  "Praktis",
  "Harga transparan",
  "Status order",
  "Support resmi",
];

type AnimatedStoreIntroProps = {
  initialProducts: Product[];
  initialTestimonials: TransactionTestimonial[];
};

export default function AnimatedStoreIntro({
  initialProducts,
  initialTestimonials,
}: AnimatedStoreIntroProps) {
  const [websiteRating, setWebsiteRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);

  useEffect(() => {
    try {
      const savedRating = Number(
        window.localStorage.getItem("qevanora-website-rating"),
      );

      if (savedRating >= 1 && savedRating <= 5) {
        setWebsiteRating(savedRating);
      }
    } catch {
      // Local storage may be unavailable in privacy-restricted browsers.
    }
  }, []);

  const saveWebsiteRating = (rating: number) => {
    setWebsiteRating(rating);

    try {
      window.localStorage.setItem(
        "qevanora-website-rating",
        String(rating),
      );
    } catch {
      // The selected rating still remains for the current page session.
    }
  };

  const products = useMemo(
    () =>
      initialProducts
        .filter(
          (product) =>
            product.active !== false &&
            product.category !== "premium-apps" &&
            product.category !== "followers-sosmed" &&
            Boolean(product.id) &&
            Boolean(product.name) &&
            Boolean(product.category),
        )
        .sort(
          (first, second) =>
            new Date(second.createdAt || 0).getTime() -
            new Date(first.createdAt || 0).getTime(),
        ),
    [initialProducts],
  );

  const categories = useMemo(
    () => getProductCategories(products),
    [products],
  );

  const testimonials = useMemo(
    () =>
      initialTestimonials
        .filter(
          (testimonial) =>
            Boolean(testimonial.id) &&
            Boolean(testimonial.name) &&
            Boolean(testimonial.productName),
        )
        .sort(
          (first, second) =>
            new Date(second.createdAt || 0).getTime() -
            new Date(first.createdAt || 0).getTime(),
        ),
    [initialTestimonials],
  );

  const latestProducts = products.slice(0, 4);
  const latestTestimonials = testimonials.slice(0, 3);

  return (
    <main className="relative isolate w-full min-w-0 max-w-full overflow-x-clip pb-6">
      <style>{`
        @keyframes qevanoraTrustScrollLeft {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }

        .qevanora-marquee-track,
        .qevanora-trust-track {
          display: flex;
          flex: none;
          width: max-content;
          max-width: none;
          white-space: nowrap;
          animation: qevanoraTrustScrollLeft 14s linear infinite;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .qevanora-marquee-track,
          .qevanora-trust-track {
            animation-duration: 60s;
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-28 top-10 h-72 w-72 rounded-full bg-blue-light-500/10 blur-3xl dark:bg-blue-light-500/10" />
        <div className="absolute -right-24 top-[28rem] h-80 w-80 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-500/10" />
      </div>

      <Reveal hero>
        <section className="relative w-full min-w-0 max-w-full overflow-hidden py-6 sm:py-10 lg:py-14">

          <div className="grid w-full min-w-0 max-w-full items-center gap-10 md:gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
            <div className="w-full min-w-0 max-w-full overflow-hidden lg:pr-2">
              <span className="qevanora-kicker qev-hero-sequence qev-hero-seq-1 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-300">
                <span className="h-2 w-2 rounded-full bg-success-500 motion-safe:animate-pulse" />
                Produk digital terpercaya
              </span>

              <h1 className="qevanora-title-metallic qev-hero-sequence qev-hero-seq-2 mt-5 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
                QEVANORA OFFICIAL
              </h1>

              <p className="qev-hero-sequence qev-hero-seq-3 mt-5 max-w-xl break-words text-sm leading-7 text-gray-600 dark:text-gray-300 sm:text-base">
                Menyediakan berbagai produk digital terpercaya dengan proses transaksi yang cepat, mudah, dan aman. Kami berkomitmen untuk memberikan pelayanan terbaik, kualitas produk yang terjamin, serta harga kompetitif yang tetap terjangkau untuk semua kalangan.
              </p>

              <div className="qev-hero-sequence qev-hero-seq-4 mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#produk-terbaru"
                  className="qevanora-gold-button inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition"
                >
                  Lihat Produk
                </a>

                <Link
                  href="/testimonials"
                  className="qevanora-blue-button inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition"
                >
                  Lihat Testimoni
                </Link>
              </div>

              <div style={{ contain: "inline-size" }} className="qev-hero-sequence qev-hero-seq-5 mt-7 w-full min-w-0 max-w-full overflow-hidden border-y border-brand-500/20 py-3">
                <div className="qevanora-marquee-track">
                  <span className="inline-flex shrink-0 items-center gap-3 px-8 text-sm font-medium text-gray-600 dark:text-gray-300">
                    <span className="text-brand-500">✦</span>
                    {marqueeText}
                  </span>
                  <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-3 px-8 text-sm font-medium text-gray-600 dark:text-gray-300">
                    <span className="text-brand-500">✦</span>
                    {marqueeText}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full min-w-0 max-w-2xl overflow-hidden lg:max-w-xl">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(214,166,47,0.18),transparent_68%)] blur-2xl" />

              <div className="relative w-full min-w-0 max-w-full overflow-hidden">
                <div className="qevanora-hero-frame qev-hero-visual w-full min-w-0 max-w-full overflow-hidden">
                  <Image
                    src="/images/logo/digie-store-home.png"
                    alt="Banner QEVANORA OFFICIAL"
                    width={1536}
                    height={1024}
                    priority
                    className="block h-auto w-full max-w-full object-contain"
                  />
                </div>

                <div style={{ contain: "inline-size" }} className="qev-hero-trust mt-5 w-full min-w-0 max-w-full overflow-hidden border-y border-brand-500/20 py-2.5">
                  <div className="qevanora-trust-track">
                    {["primary", "duplicate"].map((sequence) => (
                      <div
                        key={sequence}
                        aria-hidden={sequence === "duplicate" ? true : undefined}
                        className="flex shrink-0 items-center gap-5 pr-5"
                      >
                        {trustMarqueeItems.map((item) => (
                          <span
                            key={`${sequence}-${item}`}
                            className="inline-flex shrink-0 items-center gap-2 px-4 py-2 text-xs font-semibold text-[#f7d56e] sm:text-sm"
                          >
                            <Image
                              src="/images/icons/done-all.svg"
                              alt=""
                              width={18}
                              height={18}
                              aria-hidden="true"
                              unoptimized
                              className="h-[18px] w-[18px] shrink-0 object-contain"
                            />
                            <span>{item}</span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal className="mt-5" delay={70}>
        <aside
          aria-label="Informasi keamanan QEVANORA"
          className="overflow-hidden rounded-2xl border border-brand-500/40 bg-brand-50/80 p-4 shadow-theme-xs dark:border-brand-400/30 dark:bg-brand-500/[0.08] sm:p-5"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-white text-brand-600 dark:border-brand-400/25 dark:bg-white/[0.06] dark:text-brand-400">
              <svg
                aria-hidden="true"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 8v5m0 3h.01"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>

            <div className="min-w-0">
              <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">
                Domain resmi QEVANORA hanya{" "}
                <strong className="break-all font-bold text-gray-900 dark:text-white">
                  qevanoraofficial.my.id
                </strong>
                . Kami tidak pernah meminta password, OTP, cookie login, atau
                kode verifikasi akun pribadi.
              </p>
            </div>
          </div>
        </aside>
      </Reveal>

      <Reveal className="mt-5" delay={80}>
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {benefits.map((benefit, index) => (
            <article
              key={benefit.title}
              className="qevanora-card rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  0{index + 1}
                </span>
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-white/90">
                    {benefit.title}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {benefit.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </Reveal>

      <Reveal className="mt-10" delay={100}>
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-500">
                Jelajahi QEVANORA OFFICIAL
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                Semua kebutuhan dalam satu tempat
              </h2>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {quickLinks.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="qevanora-card group rounded-2xl border border-gray-200 bg-white p-5 transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40"
              >
                <IconBox>{item.icon}</IconBox>
                <h3 className="mt-4 font-semibold text-gray-800 group-hover:text-brand-500 dark:text-white/90">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {categories.length > 0 && (
        <Reveal className="mt-10" delay={120}>
          <section className="qevanora-card rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
            <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <p className="text-sm font-semibold text-brand-500">
                  Kategori produk
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                  Pilih kategori yang kamu butuhkan
                </h2>
              </div>

              <div
                aria-label="Kategori produk"
                className="flex w-full min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="navigation"
                tabIndex={0}
              >
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/products/${category.slug}`}
                    className="shrink-0 snap-start whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-400 dark:focus-visible:ring-offset-gray-900"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </Reveal>
      )}

      <Reveal className="mt-10" delay={140}>
        <section id="produk-terbaru" className="scroll-mt-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-500">
                Produk terbaru
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                Pilihan produk digital untukmu
              </h2>
            </div>
          </div>

          {latestProducts.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {latestProducts.map((product) => (
                <article
                  key={product.id}
                  className="qevanora-card group overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:-translate-y-1 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <Image
                      src={
                        product.image ||
                        "/images/products/product-placeholder.svg"
                      }
                      alt={`Gambar ${product.name}`}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                      className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>

                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold text-brand-500">
                        {product.categoryName || "Produk Digital"}
                      </span>
                      <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                        Stok {Number(product.stock) || 0}
                      </span>
                    </div>

                    <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-gray-800 dark:text-white/90">
                      {product.name}
                    </h3>

                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {shortText(product)}
                    </p>

                    <p className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
                      {formatRupiah(product.price)}
                    </p>

                    <Link
                      href={`/products/${product.category}/${product.id}`}
                      className="qevanora-gold-button mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition"
                    >
                      Detail Produk
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center dark:border-gray-700 dark:bg-white/[0.03]">
              <h3 className="font-semibold text-gray-800 dark:text-white/90">
                Produk sedang disiapkan
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Produk terbaru akan tampil otomatis setelah ditambahkan.
              </p>
            </div>
          )}
        </section>
      </Reveal>

      <Reveal className="mt-10" delay={160}>
        <section className="qevanora-card overflow-hidden rounded-3xl border px-5 py-7 text-white sm:px-8 sm:py-9">
          <div className="grid gap-7 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-blue-light-400">
                Bukti transaksi
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Belanja lebih yakin dengan testimoni pelanggan.
              </h2>
              <p className="mt-3 text-sm leading-7 text-gray-300">
                Lihat riwayat transaksi sukses yang sudah ditampilkan di
                halaman Testimoni.
              </p>
              <Link
                href="/testimonials"
                className="qevanora-gold-button mt-5 inline-flex items-center rounded-xl px-5 py-3 text-sm font-semibold transition"
              >
                Lihat Semua Testimoni
              </Link>
            </div>

            {latestTestimonials.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {latestTestimonials.map((testimonial, index) => (
                  <article
                    key={testimonial.id || `${testimonial.name}-${index}`}
                    className="qevanora-card rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-success-400">
                        ✓ TRANSAKSI SUKSES
                      </span>
                      <span className="text-xs text-gray-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mt-3 line-clamp-1 font-semibold">
                      {testimonial.productName}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-sm text-gray-400">
                      {testimonial.name}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-white">
                      {formatRupiah(testimonial.totalPrice)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="qevanora-card rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-gray-300">
                Testimoni pelanggan akan tampil otomatis di bagian ini.
              </div>
            )}
          </div>
        </section>
      </Reveal>

      <Reveal className="mt-10" delay={180}>
        <section
          aria-labelledby="website-rating-title"
          className="qevanora-card rounded-3xl border p-6 text-center sm:p-8"
        >
          <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">
            Rating Website
          </p>
          <h2
            id="website-rating-title"
            className="mt-2 text-2xl font-bold text-gray-900 dark:text-white"
          >
            Bagaimana pengalamanmu?
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-gray-600 dark:text-gray-300">
            Berikan rating untuk website QEVANORA OFFICIAL.
          </p>

          <div
            aria-label="Pilih rating website"
            className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3"
            role="group"
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const isActive =
                star <= (hoveredRating || websiteRating);

              return (
                <button
                  key={star}
                  aria-label={`${star} bintang`}
                  aria-pressed={websiteRating === star}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border text-3xl leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
                    isActive
                      ? "border-brand-400 bg-brand-50 text-[#d6a62f] shadow-theme-xs dark:border-brand-400/50 dark:bg-brand-500/10 dark:text-[#f7d56e]"
                      : "border-gray-200 bg-gray-50 text-gray-300 hover:border-brand-300 hover:text-brand-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600 dark:hover:border-brand-500/40 dark:hover:text-brand-400"
                  }`}
                  onBlur={() => setHoveredRating(0)}
                  onClick={() => saveWebsiteRating(star)}
                  onFocus={() => setHoveredRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  type="button"
                >
                  <span aria-hidden="true">★</span>
                </button>
              );
            })}
          </div>

          <p
            aria-live="polite"
            className="mt-4 min-h-6 text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            {websiteRating
              ? `Terima kasih! Kamu memberi rating ${websiteRating} dari 5.`
              : "Pilih jumlah bintang sesuai pengalamanmu."}
          </p>
        </section>
      </Reveal>

      <Reveal className="mt-10" delay={200}>
        <footer className="border-t border-gray-200 py-7 text-center dark:border-gray-800">
          <p className="text-sm font-medium leading-7 text-gray-500 dark:text-gray-400">
            © 2026 QEVANORA OFFICIAL. All Rights Reserved. Made with ❤️ in QEVANORA OFFICIAL
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-gray-400">
            <Link href="/privacy" className="hover:text-brand-500">
              Kebijakan Privasi
            </Link>
            <Link href="/disclaimer" className="hover:text-brand-500">
              Disclaimer
            </Link>
            <Link href="/support" className="hover:text-brand-500">
              Support
            </Link>
          </div>
        </footer>
      </Reveal>
    </main>
  );
}
