import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Content | QEVANORA OFFICIAL",
  description:
    "Panduan, informasi, dan halaman penting resmi QEVANORA OFFICIAL.",
};

const orderSteps = [
  {
    number: "01",
    title: "Pilih Produk",
    description:
      "Pilih produk digital yang sesuai dengan kebutuhan Anda.",
  },
  {
    number: "02",
    title: "Periksa Detail",
    description:
      "Pastikan harga, stok, deskripsi, dan ketentuan produk sudah sesuai.",
  },
  {
    number: "03",
    title: "Buat Pesanan",
    description:
      "Isi data pesanan dengan benar agar transaksi dapat diproses.",
  },
  {
    number: "04",
    title: "Pantau Status",
    description:
      "Lihat perkembangan pesanan melalui notifikasi akun yang sedang aktif.",
  },
];

const informationLinks = [
  {
    title: "Produk Digital",
    description:
      "Lihat daftar produk dan pilih produk yang ingin Anda pesan.",
    href: "/#produk-terbaru",
    action: "Lihat Produk",
  },
  {
    title: "Testimoni",
    description:
      "Lihat bukti transaksi dan pengalaman pelanggan sebelumnya.",
    href: "/testimonials",
    action: "Lihat Testimoni",
  },
  {
    title: "Pusat Bantuan",
    description:
      "Hubungi layanan resmi apabila membutuhkan bantuan transaksi.",
    href: "/support",
    action: "Hubungi Support",
  },
];

export default function ContentPage() {
  return (
    <main className="w-full min-w-0 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-white/[0.03] p-5 shadow-theme-sm sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(194,149,51,0.16),transparent_48%)]" />

        <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10">
            <Image
              src="/images/icons/content-book.svg"
              alt=""
              width={34}
              height={34}
              aria-hidden="true"
              className="h-9 w-9 object-contain"
            />
          </span>

          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.28em] text-brand-400">
              QEVANORA OFFICIAL
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              ᴄᴏɴᴛᴇɴᴛ
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-gray-400 sm:text-base">
              Temukan panduan pemesanan, informasi layanan, serta akses
              cepat ke halaman penting QEVANORA OFFICIAL.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-brand-500/15 bg-white/[0.025] p-5 sm:p-7">
        <div>
          <p className="text-sm font-semibold text-brand-400">
            Panduan Pemesanan
          </p>
          <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            Proses transaksi yang mudah dipahami
          </h2>
        </div>

        <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          {orderSteps.map((step) => (
            <article
              key={step.number}
              className="flex min-w-0 items-start gap-4 rounded-2xl border border-brand-500/15 bg-[#100c09] p-4 sm:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-sm font-bold text-brand-300">
                {step.number}
              </span>

              <div className="min-w-0">
                <h3 className="font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-1 break-words text-sm leading-6 text-gray-400">
                  {step.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div>
          <p className="text-sm font-semibold text-brand-400">
            Informasi & Bantuan
          </p>
          <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            Akses halaman yang Anda butuhkan
          </h2>
        </div>

        <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
          {informationLinks.map((item) => (
            <article
              key={item.title}
              className="flex min-w-0 flex-col rounded-2xl border border-brand-500/15 bg-white/[0.025] p-5"
            >
              <h3 className="text-lg font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-2 flex-1 break-words text-sm leading-6 text-gray-400">
                {item.description}
              </p>

              <Link
                href={item.href}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-[#120d0a] transition hover:bg-brand-400"
              >
                {item.action}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/privacy"
          className="rounded-2xl border border-brand-500/15 bg-white/[0.025] p-5 transition hover:border-brand-400/40 hover:bg-brand-500/[0.06]"
        >
          <p className="font-semibold text-white">Kebijakan Privasi</p>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            Pelajari cara data dan informasi pelanggan dilindungi.
          </p>
        </Link>

        <Link
          href="/disclaimer"
          className="rounded-2xl border border-brand-500/15 bg-white/[0.025] p-5 transition hover:border-brand-400/40 hover:bg-brand-500/[0.06]"
        >
          <p className="font-semibold text-white">Disclaimer</p>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            Baca ketentuan dan batasan layanan QEVANORA OFFICIAL.
          </p>
        </Link>
      </section>
    </main>
  );
}
