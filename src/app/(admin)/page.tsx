import AnimatedStoreIntro from "@/components/home/AnimatedStoreIntro";
import { getProducts, getTestimonials } from "@/lib/catalog";
import type { Metadata } from "next";

// The homepage is shared content, so cache the rendered result instead of
// rebuilding the full Next.js page on every request. This keeps Cloudflare
// Worker CPU usage safely below the Free-plan per-request limit while still
// refreshing catalog/testimonial data periodically.
export const dynamic = "force-static";
export const revalidate = 300;

export const metadata: Metadata = {
  title: "QEVANORA OFFICIAL | Produk Digital Terpercaya",
  description:
    "Temukan produk digital, testimoni transaksi, status order, dan dukungan resmi QEVANORA OFFICIAL dalam satu website.",
};

export default async function HomePage() {
  const [products, testimonials] = await Promise.all([
    getProducts(),
    getTestimonials(),
  ]);

  return (
    <>
      <AnimatedStoreIntro
        initialProducts={products}
        initialTestimonials={testimonials}
      />
    </>
  );
}
