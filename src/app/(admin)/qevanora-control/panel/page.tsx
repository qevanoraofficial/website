import AdminDashboard from "@/components/admin/AdminDashboard";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin-auth";
import { getProducts, getTestimonials } from "@/lib/catalog";
import { getMemberSummary } from "@/lib/member-stats";
import type { MemberSummary } from "@/lib/member-stats";
import { getVisitorSummary } from "@/lib/visitor-stats";
import type { VisitorSummary } from "@/lib/visitor-stats";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin Panel | QEVANORA OFFICIAL",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

const emptyVisitorSummary: VisitorSummary = {
  totalVisitors: 0,
  totalGuestVisitors: 0,
  totalMemberVisitors: 0,
  todayVisitors: 0,
  todayGuestVisitors: 0,
  todayMemberVisitors: 0,
  yesterdayVisitors: 0,
  last7Days: [],
};

const emptyMemberSummary: MemberSummary = {
  totalMembers: 0,
  newMembersToday: 0,
  newMembers7Days: 0,
  last7Days: [],
  recentMembers: [],
};

export default async function AdminPanelPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifyAdminSessionToken(session)) {
    redirect("/qevanora-control");
  }

  const [productsResult, testimonialsResult, visitorsResult, membersResult] =
    await Promise.allSettled([
      getProducts({ includeInactive: true, strict: true }),
      getTestimonials({ strict: true }),
      getVisitorSummary(),
      getMemberSummary(),
    ]);

  const errors = Array.from(
    new Set(
      [
        productsResult,
        testimonialsResult,
        visitorsResult,
        membersResult,
      ]
        .filter((result) => result.status === "rejected")
        .map((result) =>
          result.status === "rejected" && result.reason instanceof Error
            ? result.reason.message
            : "Sebagian data admin gagal dimuat.",
        ),
    ),
  );

  return (
    <AdminDashboard
      initialProducts={
        productsResult.status === "fulfilled" ? productsResult.value : []
      }
      initialTestimonials={
        testimonialsResult.status === "fulfilled"
          ? testimonialsResult.value
          : []
      }
      initialVisitorSummary={
        visitorsResult.status === "fulfilled"
          ? visitorsResult.value
          : emptyVisitorSummary
      }
      initialMemberSummary={
        membersResult.status === "fulfilled"
          ? membersResult.value
          : emptyMemberSummary
      }
      initialError={errors.length > 0 ? errors.join(" ") : undefined}
    />
  );
}
