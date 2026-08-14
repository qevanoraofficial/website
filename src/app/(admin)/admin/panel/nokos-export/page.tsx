import NokosFullExport from "@/components/admin/NokosFullExport";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Export Harga Nokos | QEVANORA OFFICIAL",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function NokosExportPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifyAdminSessionToken(session)) {
    redirect("/admin");
  }

  return <NokosFullExport />;
}
