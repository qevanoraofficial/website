import AnimatedStoreIntro from "@/components/home/AnimatedStoreIntro";
import { getProducts, getTestimonials } from "@/lib/catalog";
import type { Metadata } from "next";

// Homepage is public/shared content. Keep it fully static so Cloudflare does not
// spend Worker CPU re-rendering the full Next.js page on requests or ISR refreshes.
// Catalog/testimonial changes are picked up on the next production deployment.
export const dynamic = "error";
export const revalidate = false;
export const fetchCache = "force-cache";

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
