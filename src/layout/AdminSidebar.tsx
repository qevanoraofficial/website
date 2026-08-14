"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSidebar } from "@/context/SidebarContext";
import DashboardIcon from "@/icons/grid.svg";
import ProductIcon from "@/icons/product.svg";
import TestimonialIcon from "@/icons/testimonial.svg";

type AdminMenuKey =
  | "summary"
  | "add-product"
  | "delete-product"
  | "add-stock"
  | "add-testimonial"
  | "delete-testimonial";

type SubmenuItem = {
  key: AdminMenuKey;
  name: string;
  href: string;
};

const productSubmenu: SubmenuItem[] = [
  {
    key: "delete-product",
    name: "ʜᴀᴘᴜꜱ ᴘʀᴏᴅᴜᴋ",
    href: "/admin/panel/products/delete",
  },
  {
    key: "add-product",
    name: "ᴀᴅᴅ ᴘʀᴏᴅᴜᴋ",
    href: "/admin/panel/products/add",
  },
  {
    key: "add-stock",
    name: "ᴇᴅɪᴛ ꜱᴛᴏᴄᴋ",
    href: "/admin/panel/products/stock",
  },
];

const testimonialSubmenu: SubmenuItem[] = [
  {
    key: "delete-testimonial",
    name: "ʜᴀᴘᴜꜱ ᴛᴇꜱᴛɪᴍᴏɴɪ",
    href: "/admin/panel#delete-testimonial",
  },
  {
    key: "add-testimonial",
    name: "ᴀᴅᴅ ᴛᴇꜱᴛɪᴍᴏɴɪ",
    href: "/admin/panel#add-testimonial",
  },
];

function readActiveMenu(): AdminMenuKey {
  if (typeof window === "undefined") {
    return "summary";
  }

  const pathname = window.location.pathname;

  if (pathname.endsWith("/products/add")) {
    return "add-product";
  }

  if (pathname.endsWith("/products/stock")) {
    return "add-stock";
  }

  if (pathname.endsWith("/products/delete")) {
    return "delete-product";
  }

  const hash = window.location.hash.slice(1) as AdminMenuKey;
  const allowed: AdminMenuKey[] = [
    "summary",
    "add-product",
    "delete-product",
    "add-stock",
    "add-testimonial",
    "delete-testimonial",
  ];

  return allowed.includes(hash) ? hash : "summary";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminSidebar() {
  const {
    isExpanded,
    isMobileOpen,
    isHovered,
    setIsHovered,
    toggleMobileSidebar,
  } = useSidebar();
  const [activeMenu, setActiveMenu] = useState<AdminMenuKey>("summary");
  const [productOpen, setProductOpen] = useState(false);
  const [testimonialOpen, setTestimonialOpen] = useState(false);

  useEffect(() => {
    const updateActiveMenu = () => {
      const next = readActiveMenu();
      setActiveMenu(next);

      if (
        next === "add-product" ||
        next === "delete-product" ||
        next === "add-stock"
      ) {
        setProductOpen(true);
      }

      if (next === "add-testimonial" || next === "delete-testimonial") {
        setTestimonialOpen(true);
      }
    };

    updateActiveMenu();
    window.addEventListener("hashchange", updateActiveMenu);
    return () => window.removeEventListener("hashchange", updateActiveMenu);
  }, []);

  const showLabels = isExpanded || isHovered || isMobileOpen;
  const productActive =
    activeMenu === "add-product" ||
    activeMenu === "delete-product" ||
    activeMenu === "add-stock";
  const testimonialActive =
    activeMenu === "add-testimonial" || activeMenu === "delete-testimonial";

  const closeMobileSidebar = () => {
    if (isMobileOpen) {
      toggleMobileSidebar();
    }
  };

  const handleSubmenuClick = (key: AdminMenuKey) => {
    setActiveMenu(key);
    closeMobileSidebar();
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-brand-500/15 bg-[#020b18] px-5 text-white transition-all duration-300 ease-in-out lg:mt-0 ${
        isExpanded || isMobileOpen || isHovered ? "w-[290px]" : "w-[90px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex py-8 ${
          !showLabels ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link
          href="/admin/panel#summary"
          className="flex items-center gap-3"
          onClick={() => {
            setActiveMenu("summary");
            closeMobileSidebar();
          }}
        >
          <Image
            src="/images/logo/digie-store-icon.png"
            alt="Logo QEVANORA OFFICIAL"
            width={42}
            height={42}
            className="qevanora-brand-mark h-10 w-10 shrink-0 object-contain"
            priority
          />
          {showLabels && (
            <span className="qevanora-brand-wordmark whitespace-nowrap text-xl font-bold">
              QEVANORA OFFICIAL
            </span>
          )}
        </Link>
      </div>

      <nav className="mb-6 flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <ul className="flex flex-col gap-3">
          <li>
            <Link
              href="/admin/panel#summary"
              onClick={() => {
                setActiveMenu("summary");
                closeMobileSidebar();
              }}
              className={`menu-item group ${
                activeMenu === "summary"
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } ${!showLabels ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span
                className={
                  activeMenu === "summary"
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }
              >
                <DashboardIcon />
              </span>
              {showLabels && (
                <span className="menu-item-text">ᴅᴀꜱʜʙᴏʀᴅ</span>
              )}
            </Link>
          </li>

          <li>
            <button
              type="button"
              onClick={() => setProductOpen((current) => !current)}
              aria-expanded={productOpen}
              className={`menu-item group ${
                productActive ? "menu-item-active" : "menu-item-inactive"
              } ${!showLabels ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span
                className={
                  productActive
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }
              >
                <ProductIcon />
              </span>
              {showLabels && (
                <>
                  <span className="menu-item-text flex-1 text-left">ᴘʀᴏᴅᴜᴋ</span>
                  <ChevronIcon open={productOpen} />
                </>
              )}
            </button>

            {showLabels && productOpen && (
              <ul className="mt-2 space-y-1 border-l border-brand-500/20 pl-4">
                {productSubmenu.map((item) => {
                  const active = activeMenu === item.key;

                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={() => handleSubmenuClick(item.key)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-brand-500/12 text-brand-300"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            active ? "bg-brand-300" : "bg-gray-500"
                          }`}
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>

          <li>
            <button
              type="button"
              onClick={() => setTestimonialOpen((current) => !current)}
              aria-expanded={testimonialOpen}
              className={`menu-item group ${
                testimonialActive ? "menu-item-active" : "menu-item-inactive"
              } ${!showLabels ? "lg:justify-center" : "lg:justify-start"}`}
            >
              <span
                className={
                  testimonialActive
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }
              >
                <TestimonialIcon />
              </span>
              {showLabels && (
                <>
                  <span className="menu-item-text flex-1 text-left">
                    ᴛᴇꜱᴛɪᴍᴏɴɪ
                  </span>
                  <ChevronIcon open={testimonialOpen} />
                </>
              )}
            </button>

            {showLabels && testimonialOpen && (
              <ul className="mt-2 space-y-1 border-l border-brand-500/20 pl-4">
                {testimonialSubmenu.map((item) => {
                  const active = activeMenu === item.key;

                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={() => handleSubmenuClick(item.key)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-brand-500/12 text-brand-300"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            active ? "bg-brand-300" : "bg-gray-500"
                          }`}
                        />
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        </ul>
      </nav>
    </aside>
  );
}
