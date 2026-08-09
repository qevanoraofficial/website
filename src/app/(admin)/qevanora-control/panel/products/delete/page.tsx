import AdminDeleteProductPage from "@/components/admin/AdminDeleteProductPage";
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
  title: "Hapus Produk | QEVANORA OFFICIAL",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function DeleteProductPage() {
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

    return <AdminDeleteProductPage initialProducts={products} />;
  } catch (error) {
    return (
      <AdminDeleteProductPage
        initialProducts={[]}
        initialError={
          error instanceof Error ? error.message : "Data produk gagal dimuat."
        }
      />
    );
  }
}
