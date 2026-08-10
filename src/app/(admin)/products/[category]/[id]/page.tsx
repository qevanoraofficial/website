import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuyProductButton from "@/components/products/BuyProductButton";
import { getProducts } from "@/lib/catalog";
import { getFollowProduct } from "@/lib/follow";
import {
  formatRupiah,
  getFullDescription,
  getProduct,
} from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductDetailPageProps = {
  params: Promise<{ category: string; id: string }>;
};

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { category, id } = await params;
  const product = category === "nokos" && id.startsWith("follow-")
    ? await getFollowProduct(id)
    : getProduct(await getProducts(), category, id);

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
  const product = category === "nokos" && id.startsWith("follow-")
    ? await getFollowProduct(id)
    : getProduct(await getProducts(), category, id);

  if (!product) {
    notFound();
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
      <p className="text-sm font-medium text-brand-500 dark:text-brand-400">
        {product.categoryName}
      </p>

      <h1 className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90 sm:text-3xl">
        {product.name}
      </h1>

      <p className="mt-6 whitespace-pre-line text-sm leading-7 text-gray-600 dark:text-gray-300 sm:text-base">
        {getFullDescription(product)}
      </p>

      <div className="mt-8 flex items-center justify-between gap-4 border-y border-gray-200 py-5 dark:border-gray-800">
        <p className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
          {formatRupiah(product.ratePer1000 || product.price)}
          {product.supplier === "follow" && <span className="ml-1 text-xs font-medium text-gray-400">/ 1.000</span>}
        </p>

        {product.supplier === "follow" ? (
          <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            Min {Number(product.minQuantity || 1).toLocaleString("id-ID")} • Max {Number(product.maxQuantity || product.stock).toLocaleString("id-ID")}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            Stok {product.stock}
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
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

        <Link
          href={`/products/${product.category}`}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Kembali
        </Link>
      </div>
    </article>
  );
}
