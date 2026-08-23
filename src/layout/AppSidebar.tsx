"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSidebar } from "../context/SidebarContext";
import { ChevronDownIcon } from "../icons/index";
import HomeIcon from "../icons/home.svg";
import ProductIcon from "../icons/product.svg";
import ProductCategoryIcon from "../icons/product-category.svg";
import TestimonialIcon from "../icons/testimonial.svg";
import SupportIcon from "../icons/support.svg";
import DisclaimerIcon from "../icons/disclaimer.svg";
import PrivacyIcon from "../icons/privacy.svg";
import ProfileAccountIcon from "../icons/profile-account.svg";
import type { Product } from "@/types/catalog";
import { getProductCategories } from "@/lib/products";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: {
    name: string;
    path: string;
    icon?: React.ReactNode;
  }[];
};

type CatalogResponse = {
  ok?: boolean;
  products?: Product[];
};

const SIDEBAR_CATEGORY_PRIORITY: Record<string, number> = {
  nokos: 0,
  "sosmed-facebook": 1,
  "layanan-digital": 2,
};

const otherItems: NavItem[] = [
  {
    icon: <ProfileAccountIcon />,
    name: "ᴘʀᴏꜰɪʟᴇ ᴀᴄᴄᴏᴜɴᴛ",
    path: "/profile",
  },
];

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const [categories, setCategories] = useState<
    { slug: string; name: string }[]
  >([]);
  const [productMenuOpen, setProductMenuOpen] = useState(
    pathname.startsWith("/products/"),
  );
  const [submenuHeight, setSubmenuHeight] = useState(0);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/catalog?type=products", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as CatalogResponse;
        if (!response.ok || !payload.ok || !Array.isArray(payload.products)) {
          return;
        }

        setCategories(
          getProductCategories(payload.products).filter(
            (category) =>
              category.slug !== "premium-apps" &&
              category.slug !== "followers-sosmed",
          ),
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Kategori produk gagal dibaca.", error);
        }
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/products/")) {
      setProductMenuOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    setSubmenuHeight(productMenuOpen ? submenuRef.current?.scrollHeight || 0 : 0);
  }, [productMenuOpen, categories]);

  const navItems = useMemo<NavItem[]>(
    () => [
      { icon: <HomeIcon />, name: "ʜᴏᴍᴇ", path: "/" },
      {
        icon: <ProductIcon />,
        name: "ᴘʀᴏᴅᴜᴋ",
        subItems: [...categories]
          .sort(
            (first, second) =>
              (SIDEBAR_CATEGORY_PRIORITY[first.slug] ??
                Number.MAX_SAFE_INTEGER) -
              (SIDEBAR_CATEGORY_PRIORITY[second.slug] ??
                Number.MAX_SAFE_INTEGER),
          )
          .map((category) => ({
            name: category.name,
            path: `/products/${category.slug}`,
            icon: <ProductCategoryIcon />,
          })),
      },
      {
        icon: <TestimonialIcon />,
        name: "ᴛᴇꜱᴛɪᴍᴏɴɪ",
        path: "/testimonials",
      },
      { icon: <SupportIcon />, name: "ꜱᴜᴘᴘᴏʀᴛ", path: "/support" },
      {
        icon: <DisclaimerIcon />,
        name: "ᴅɪꜱᴄʟᴀɪᴍᴇʀ",
        path: "/disclaimer",
      },
      { icon: <PrivacyIcon />, name: "ᴘʀɪᴠᴀꜱɪ", path: "/privacy" },
    ],
    [categories],
  );

  const isActive = useCallback((path: string) => path === pathname, [pathname]);
  const showLabels = isExpanded || isHovered || isMobileOpen;

  const renderItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        if (item.subItems) {
          const active = pathname.startsWith("/products/");
          return (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => setProductMenuOpen((current) => !current)}
                className={`menu-item group cursor-pointer ${
                  active || productMenuOpen
                    ? "menu-item-active"
                    : "menu-item-inactive"
                } ${!showLabels ? "lg:justify-center" : "lg:justify-start"}`}
              >
                <span
                  className={
                    active || productMenuOpen
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }
                >
                  {item.icon}
                </span>
                {showLabels && (
                  <>
                    <span className="menu-item-text">{item.name}</span>
                    <ChevronDownIcon
                      className={`ml-auto h-5 w-5 transition-transform duration-200 ${
                        productMenuOpen ? "rotate-180 text-brand-500" : ""
                      }`}
                    />
                  </>
                )}
              </button>

              {showLabels && (
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ height: `${submenuHeight}px` }}
                >
                  <div ref={submenuRef}>
                    {item.subItems.length > 0 ? (
                      <ul className="ml-9 mt-2 space-y-1">
                        {item.subItems.map((subItem) => (
                          <li key={subItem.path}>
                            <Link
                              href={subItem.path}
                              className={`menu-dropdown-item ${
                                isActive(subItem.path)
                                  ? "menu-dropdown-item-active"
                                  : "menu-dropdown-item-inactive"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                {subItem.icon && (
                                  <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                                    {subItem.icon}
                                  </span>
                                )}
                                <span>{subItem.name}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ml-9 mt-2 px-3 py-2 text-xs text-gray-400">
                        Belum ada kategori
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        }

        if (!item.path) return null;
        return (
          <li key={item.name}>
            <Link
              href={item.path}
              className={`menu-item group ${
                isActive(item.path) ? "menu-item-active" : "menu-item-inactive"
              }`}
            >
              <span
                className={
                  isActive(item.path)
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }
              >
                {item.icon}
              </span>
              {showLabels && <span className="menu-item-text">{item.name}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 ${
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
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/images/logo/digie-store-icon.png"
            alt="Logo QEVANORA OFFICIAL"
            width={42}
            height={42}
            className="qevanora-brand-mark h-10 w-10 shrink-0 object-contain"
            priority
          />
          {showLabels && (
            <span className="qevanora-brand-wordmark whitespace-nowrap text-lg font-bold">
              QEVANORA OFFICIAL
            </span>
          )}
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>{renderItems(navItems)}</div>
            <div>{renderItems(otherItems)}</div>
          </div>
        </nav>
      </div>
    </aside>
  );
}
