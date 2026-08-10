import AnimatedStoreIntro from "@/components/home/AnimatedStoreIntro";
import StoreHoursStatus from "@/components/home/StoreHoursStatus";
import { getProducts, getTestimonials } from "@/lib/catalog";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      <StoreHoursStatus />
      <AnimatedStoreIntro
        initialProducts={products}
        initialTestimonials={testimonials}
      />
    </>
  );
}
