import PremiumAppsBuyButton from "@/components/products/PremiumAppsBuyButton";
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
        <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">Premium Apps</h1>
        <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Premium Apps belum tersedia</h2>
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
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">Premium Apps</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Harga dan stok diperbarui langsung dari supplier.</p>
        </div>
        <span className="rounded-full border border-success-500/20 bg-success-500/10 px-3 py-1.5 text-xs font-semibold text-success-600 dark:text-success-500">LIVE</span>
      </div>

      {products.length === 0 ? (
        <section className="flex min-h-[360px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Stok Premium Apps sedang kosong</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Produk akan tampil otomatis saat stok supplier tersedia.</p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className="flex min-h-[250px] flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">Premium Apps</p>
                  <h2 className="mt-2 break-words text-lg font-bold text-gray-800 dark:text-white/90">{product.name}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-success-500/10 px-2.5 py-1 text-xs font-semibold text-success-600 dark:text-success-500">Stok {product.stock}</span>
              </div>

              <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{getShortDescription(product)}</p>

              <div className="mt-auto pt-5">
                <p className="text-xl font-black text-gray-800 dark:text-white/90">{formatRupiah(product.price)}</p>
                <PremiumAppsBuyButton productId={product.id} productName={product.name} price={product.price} stock={product.stock} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
