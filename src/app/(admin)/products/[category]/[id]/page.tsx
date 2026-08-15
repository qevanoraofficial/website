import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuyProductButton from "@/components/products/BuyProductButton";
import PremiumAppsBuyButton from "@/components/products/PremiumAppsBuyButton";
import { getProducts } from "@/lib/catalog";
import { getFollowProduct } from "@/lib/follow";
import { getPremiumAppsCatalog } from "@/lib/premium-apps";
import {
  formatRupiah,
  getFullDescription,
  getProduct,
} from "@/lib/products";
import type { Product } from "@/types/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductDetailPageProps = {
  params: Promise<{ category: string; id: string }>;
};

async function resolveProduct(category: string, id: string): Promise<Product | null> {
  if (category === "premium-apps") {
    const products = await getPremiumAppsCatalog();
    return products.find((product) => product.id === id) || null;
  }

  if (
    (category === "followers-sosmed" || category === "nokos") &&
    id.startsWith("follow-")
  ) {
    return getFollowProduct(id);
  }

  return getProduct(await getProducts(), category, id);
}

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { category, id } = await params;
  const product = await resolveProduct(category, id);

  if (!product) {
    return { title: "Produk Tidak Ditemukan | QEVANORA OFFICIAL" };
  }

  return {
    title: `${product.name} | QEVANORA OFFICIAL`,
    description: getFullDescription(product),
  };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { category, id } = await params;
  const product = await resolveProduct(category, id);

  if (!product) {
    notFound();
  }

  const isPremiumApp = product.category === "premium-apps";
  const image = product.image || "/images/products/product-placeholder.svg";

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02] lg:border-b-0 lg:border-r lg:p-6">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#071523]">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-[#0a1b2d]">
              <img
                src={image}
                alt={`Gambar ${product.name}`}
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-brand-500/15 bg-brand-500/[0.06] p-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Baca detail dan ketentuan produk sampai selesai sebelum melakukan pembelian.
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-500 dark:text-brand-400">
                {product.categoryName}
              </p>

              <h1 className="mt-2 break-words text-2xl font-bold text-gray-800 dark:text-white/90 sm:text-3xl">
                {product.name}
              </h1>
            </div>

            <span className="shrink-0 rounded-full bg-success-500/10 px-3 py-1.5 text-sm font-semibold text-success-600 dark:text-success-500">
              Stok {product.stock}
            </span>
          </div>

          <div className="mt-7">
            <h2 className="text-base font-bold text-gray-800 dark:text-white/90">
              Deskripsi Produk
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-gray-600 dark:text-gray-300 sm:text-base">
              {getFullDescription(product)}
            </p>
          </div>

          <div className="mt-8 border-y border-gray-200 py-5 dark:border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
              Harga
            </p>
            <p className="mt-1 text-2xl font-black text-gray-800 dark:text-white/90 sm:text-3xl">
              {formatRupiah(product.ratePer1000 || product.price)}
              {product.supplier === "follow" && (
                <span className="ml-1 text-xs font-medium text-gray-400">/ 1.000</span>
              )}
            </p>

            {product.supplier === "follow" && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Min {Number(product.minQuantity || 1).toLocaleString("id-ID")} • Max{" "}
                {Number(product.maxQuantity || product.stock).toLocaleString("id-ID")}
              </p>
            )}
          </div>

          <div className="mt-2">
            {isPremiumApp ? (
              <PremiumAppsBuyButton
                productId={product.id}
                productName={product.name}
                price={product.price}
                stock={product.stock}
              />
            ) : (
              <BuyProductButton
                productId={product.id}
                productName={product.name}
                categoryName={product.categoryName}
                price={product.price}
                stock={product.stock}
                supplier={product.supplier}
                supplierProductId={product.supplierProductId}
                minQuantity={product.minQuantity}
                maxQuantity={product.maxQuantity}
                ratePer1000={product.ratePer1000}
              />
            )}

            <Link
              href={`/products/${product.category}`}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Kembali ke Daftar Produk
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
