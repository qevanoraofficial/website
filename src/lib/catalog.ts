import "server-only";
import productsFallback from "@/data/products.json";
import testimonialsFallback from "@/data/testimonials.json";
import { getStoragePaths, readJsonArray } from "@/lib/github-store";
import type { Product, TransactionTestimonial } from "@/types/catalog";


async function readCatalogArray<T>(
  path: string,
  fallback: T[],
  strict = false,
): Promise<T[]> {
  try {
    return (await readJsonArray<T>(path, fallback)).data;
  } catch (error) {
    if (strict) {
      throw error;
    }

    console.error(`[catalog] gagal membaca ${path}; memakai data bawaan`, error);
    return [...fallback];
  }
}

function text(value: unknown, maxLength = 5000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mediaUrl(imagePath?: string, fallback?: string): string {
  const path = text(imagePath, 500);
  if (path) {
    return `/api/media?path=${encodeURIComponent(path)}`;
  }
  return text(fallback, 1000);
}

function normalizeProduct(value: Product): Product {
  return {
    id: text(value.id, 100),
    category: text(value.category, 100),
    categoryName: text(value.categoryName, 120),
    name: text(value.name, 160),
    shortDescription: text(
      value.shortDescription || value.description,
      1000,
    ),
    fullDescription: text(
      value.fullDescription || value.description || value.shortDescription,
      6000,
    ),
    description: text(value.description || value.shortDescription, 1000),
    price: Math.max(0, number(value.price)),
    stock: Math.max(0, Math.trunc(number(value.stock))),
    active: value.active !== false,
    imagePath: text(value.imagePath, 500),
    image: mediaUrl(value.imagePath, value.image),
    createdAt: text(value.createdAt, 80),
    updatedAt: text(value.updatedAt, 80),
    supplier: value.supplier,
    supplierProductId: text(value.supplierProductId, 120),
    serviceType: text(value.serviceType, 120),
    providerCategory: text(value.providerCategory, 240),
    minQuantity: Math.max(0, Math.trunc(number(value.minQuantity))),
    maxQuantity: Math.max(0, Math.trunc(number(value.maxQuantity))),
    refill: Boolean(value.refill),
    cancel: Boolean(value.cancel),
    ratePer1000: Math.max(0, number(value.ratePer1000)),
    providerRate: Math.max(0, number(value.providerRate)),
    providerCurrency: text(value.providerCurrency, 20),
  };
}

function normalizeTestimonial(
  value: TransactionTestimonial,
): TransactionTestimonial {
  return {
    id: text(value.id, 100),
    status: text(value.status || "success", 40),
    name: text(value.name, 120),
    telegram: text(value.telegram, 120),
    whatsapp: text(value.whatsapp, 80),
    productName: text(value.productName, 180),
    productPrice: Math.max(0, number(value.productPrice)),
    quantity: Math.max(0, Math.trunc(number(value.quantity))),
    payment: text(value.payment, 100),
    totalPrice: Math.max(0, number(value.totalPrice)),
    purchaseDate: text(value.purchaseDate, 100),
    imagePath: text(value.imagePath, 500),
    image: mediaUrl(value.imagePath, value.image),
    createdAt: text(value.createdAt, 80),
    updatedAt: text(value.updatedAt, 80),
  };
}

export async function getProducts(options?: {
  includeInactive?: boolean;
  strict?: boolean;
}): Promise<Product[]> {
  const { products } = getStoragePaths();
  const data = await readCatalogArray<Product>(
    products,
    productsFallback as Product[],
    options?.strict,
  );

  return data
    .map(normalizeProduct)
    .filter(
      (product) =>
        Boolean(product.id) &&
        Boolean(product.name) &&
        Boolean(product.category) &&
        Boolean(product.categoryName) &&
        (options?.includeInactive || product.active !== false),
    )
    .sort(
      (first, second) =>
        new Date(second.createdAt || 0).getTime() -
        new Date(first.createdAt || 0).getTime(),
    );
}

export async function getTestimonials(options?: {
  strict?: boolean;
}): Promise<TransactionTestimonial[]> {
  const { testimonials } = getStoragePaths();
  const data = await readCatalogArray<TransactionTestimonial>(
    testimonials,
    testimonialsFallback as TransactionTestimonial[],
    options?.strict,
  );

  return data
    .map(normalizeTestimonial)
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
    );
}
