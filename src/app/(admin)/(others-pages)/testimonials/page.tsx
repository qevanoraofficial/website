import type { Metadata } from "next";
import { getTestimonials } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Testimoni | QEVANORA OFFICIAL",
  description: "Testimoni transaksi pelanggan QEVANORA OFFICIAL.",
};

function formatRupiah(value: number | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function valueOrDash(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

export default async function TestimonialsPage() {
  const testimonials = await getTestimonials();

  if (testimonials.length === 0) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="max-w-md">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
            Belum ada testimoni
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Testimoni yang ditambahkan melalui bot Telegram akan langsung muncul
            di sini tanpa menunggu bot tetap online.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {testimonials.map((testimonial, index) => {
        const testimonialNumber = String(index + 1).padStart(2, "0");

        return (
          <article
            key={testimonial.id}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
              <img
                src={
                  testimonial.image ||
                  "/images/testimonials/testimonial-placeholder.svg"
                }
                alt={`Foto transaksi ${valueOrDash(testimonial.productName)}`}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full"
              />
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-success-600 dark:text-success-500">
                  ✅TRANSAKSI SUKSES
                </h2>
                <span className="shrink-0 text-lg font-semibold text-gray-500 dark:text-gray-400">
                  {testimonialNumber}
                </span>
              </div>

              <dl className="mt-5 space-y-3 text-sm leading-6">
                {[
                  ["Nama", valueOrDash(testimonial.name)],
                  ["Telegram", valueOrDash(testimonial.telegram)],
                  ["WhatsApp", valueOrDash(testimonial.whatsapp)],
                  ["Nama Produk", valueOrDash(testimonial.productName)],
                  ["Harga Produk", formatRupiah(testimonial.productPrice)],
                  ["Jumlah Beli", valueOrDash(testimonial.quantity)],
                  ["Pembayaran", valueOrDash(testimonial.payment)],
                  ["Total Harga", formatRupiah(testimonial.totalPrice)],
                  ["Tanggal Beli", valueOrDash(testimonial.purchaseDate)],
                ].map(([label, value], fieldIndex) => (
                  <div key={label}>
                    {fieldIndex === 3 && (
                      <div className="my-5 border-t border-gray-200 dark:border-gray-800" />
                    )}
                    <div className="grid grid-cols-[120px_1fr] gap-3">
                      <dt className="text-gray-500 dark:text-gray-400">
                        {label} :
                      </dt>
                      <dd className="break-words font-medium text-gray-800 dark:text-white/90">
                        {value}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </article>
        );
      })}
    </div>
  );
}
