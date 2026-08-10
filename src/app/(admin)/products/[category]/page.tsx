import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducts } from "@/lib/catalog";
import FollowServicesCatalog from "@/components/products/FollowServicesCatalog";
import {
  formatRupiah,
  getCategoryProducts,
  getProductCategories,
  getShortDescription,
} from "@/lib/products";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CategoryPageProps = {
  params: Promise<{ category: string }>;
};

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const products = await getProducts();
  const categoryData = getProductCategories(products).find(
    (item) => item.slug === category,
  );

  if (!categoryData) {
    return { title: "Kategori Produk | QEVANORA OFFICIAL" };
  }

  return {
    title: `${categoryData.name} | QEVANORA OFFICIAL`,
    description: `Daftar produk kategori ${categoryData.name} di QEVANORA OFFICIAL.`,
  };
}

export default async function ProductCategoryPage({
  params,
}: CategoryPageProps) {
  const { category } = await params;
  const allProducts = await getProducts();
  const categoryData = getProductCategories(allProducts).find(
    (item) => item.slug === category,
  );

  if (!categoryData) {
    notFound();
  }

  if (category === "nokos") {
    return <FollowServicesCatalog />;
  }

  const products = getCategoryProducts(allProducts, category);

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
        {categoryData.name}
      </h1>

      {products.length === 0 ? (
        <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Belum ada produk
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Produk kategori ini akan muncul otomatis setelah ditambahkan melalui
              bot Telegram.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <div className="relative aspect-[4/3] w-full bg-gray-100 dark:bg-gray-800">
                <Image
                  src={
                    product.image || "/images/products/product-placeholder.svg"
                  }
                  alt={`Gambar ${product.name}`}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>

              <div className="p-5">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  {product.name}
                </h2>

                <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {getShortDescription(product)}
                </p>

                <p className="mt-5 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {formatRupiah(product.price)}
                </p>

                <Link
                  href={`/products/${product.category}/${product.id}`}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600"
                >
                  Detail Produk
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
