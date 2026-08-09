import AdminStockPage from "@/components/admin/AdminStockPage";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import { getProducts } from "@/lib/catalog";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Add Stock | QEVANORA OFFICIAL",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function StockPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifyAdminSessionToken(session)) {
    redirect("/qevanora-control");
  }

  try {
    const products = await getProducts({
      includeInactive: true,
      strict: true,
    });

    return <AdminStockPage initialProducts={products} />;
  } catch (error) {
    return (
      <AdminStockPage
        initialProducts={[]}
        initialError={
          error instanceof Error
            ? error.message
            : "Data produk gagal dimuat."
        }
      />
    );
  }
}
