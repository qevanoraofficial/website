import Link from "next/link";
import { getPremiumAppsCatalog } from "@/lib/premium-apps";
import { formatRupiah, getShortDescription } from "@/lib/products";

export default async function PremiumAppsCatalog() {
  let products;
  try {
    products = await getPremiumAppsCatalog();
  } catch (error) {
    console.error("[premium-apps] katalog gagal dibaca", error);
    return (
      <div>
        <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
          Premium Apps
        </h1>
        <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Premium Apps belum tersedia
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Katalog supplier sedang tidak dapat dimuat. Silakan coba lagi beberapa saat.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
            Premium Apps
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Pilih produk untuk melihat gambar, deskripsi lengkap, harga, dan stok sebelum membeli.
          </p>
        </div>
        <span className="rounded-full border border-success-500/20 bg-success-500/10 px-3 py-1.5 text-xs font-semibold text-success-600 dark:text-success-500">
          LIVE
        </span>
      </div>

      {products.length === 0 ? (
        <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Stok Premium Apps sedang kosong
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Produk akan tampil otomatis saat stok supplier tersedia.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const detailHref = `/products/premium-apps/${encodeURIComponent(product.id)}`;
            const image = product.image || "/images/products/product-placeholder.svg";

            return (
              <article
                key={product.id}
                className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <Link
                  href={detailHref}
                  className="group relative block aspect-[16/9] overflow-hidden border-b border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-[#071523]"
                  aria-label={`Lihat detail ${product.name}`}
                >
                  <img
                    src={image}
                    alt={`Gambar ${product.name}`}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                  <span className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    Stok {product.stock}
                  </span>
                </Link>

                <div className="flex flex-1 flex-col p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
                      Premium Apps
                    </p>
                    <Link href={detailHref} className="group/title block">
                      <h2 className="mt-2 break-words text-lg font-bold text-gray-800 transition group-hover/title:text-brand-500 dark:text-white/90">
                        {product.name}
                      </h2>
                    </Link>
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {getShortDescription(product)}
                  </p>

                  <div className="mt-auto pt-5">
                    <p className="text-xl font-black text-gray-800 dark:text-white/90">
                      {formatRupiah(product.price)}
                    </p>

                    <Link
                      href={detailHref}
                      className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
                    >
                      Lihat Detail & Beli
                    </Link>

                    <p className="mt-2 text-center text-[11px] leading-4 text-gray-400">
                      Deskripsi lengkap ditampilkan sebelum pembelian.
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
