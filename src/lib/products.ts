import type { Product } from "@/types/catalog";

export type { Product } from "@/types/catalog";

export type ProductCategory = {
  slug: string;
  name: string;
};

const pinnedProductCategories: ProductCategory[] = [
  { slug: "sosmed-facebook", name: "Sosmed Facebook" },
  { slug: "nokos", name: "Nokos" },
  { slug: "layanan-digital", name: "Layanan Digital" },
];

export function getProductCategories(products: Product[]): ProductCategory[] {
  const categories = new Map<string, string>(
    pinnedProductCategories.map((category) => [category.slug, category.name]),
  );

  products.forEach((product) => {
    if (
      product.active !== false &&
      product.category &&
      product.categoryName &&
      !categories.has(product.category)
    ) {
      categories.set(product.category, product.categoryName);
    }
  });

  const pinnedSlugs = new Set(pinnedProductCategories.map((item) => item.slug));
  const extraCategories = Array.from(categories.entries())
    .filter(([slug]) => !pinnedSlugs.has(slug))
    .map(([slug, name]) => ({ slug, name }))
    .sort((first, second) => first.name.localeCompare(second.name, "id-ID"));

  return [...pinnedProductCategories, ...extraCategories];
}

export function getCategoryProducts(
  products: Product[],
  category: string,
): Product[] {
  return products
    .filter(
      (product) =>
        product.active !== false && product.category === category,
    )
    .sort(
      (first, second) =>
        new Date(second.createdAt || 0).getTime() -
        new Date(first.createdAt || 0).getTime(),
    );
}

export function getProduct(
  products: Product[],
  category: string,
  id: string,
): Product | undefined {
  return products.find(
    (product) =>
      product.active !== false &&
      product.category === category &&
      product.id === id,
  );
}

export function getShortDescription(product: Product): string {
  return product.shortDescription || product.description || "";
}

export function getFullDescription(product: Product): string {
  return (
    product.fullDescription ||
    product.description ||
    product.shortDescription ||
    ""
  );
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}
