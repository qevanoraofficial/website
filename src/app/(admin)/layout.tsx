"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import AdminSidebar from "@/layout/AdminSidebar";
import Backdrop from "@/layout/Backdrop";
import React from "react";
import { usePathname } from "next/navigation";

import VisitorTracker from "@/components/analytics/VisitorTracker";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const pathname = usePathname();
  const isAdminPanel =
    pathname.startsWith("/admin/panel") ||
    pathname.startsWith("/qevanora-control/panel");

  // Dynamic class for main content margin based on sidebar state
  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <div className="min-h-screen w-full min-w-0 max-w-full overflow-x-clip xl:flex">
      {!isAdminPanel && <VisitorTracker />}
      {/* Sidebar and Backdrop */}
      {isAdminPanel ? <AdminSidebar /> : <AppSidebar />}
      <Backdrop />
      {/* Main Content Area */}
      <div
        className={`w-full min-w-0 max-w-full flex-1 overflow-x-clip transition-all duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* Header */}
        <AppHeader />
        {/* Page Content */}
        <div className="mx-auto w-full min-w-0 max-w-(--breakpoint-2xl) overflow-x-clip p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
