"use client";

import { useEffect, useRef, useState } from "react";
import NokosCatalog from "@/components/products/NokosCatalog";
import SMSCodeCatalog from "@/components/products/SMSCodeCatalog";

type SupplierTab = "smscode" | "nokos";

const SERVICE_ICONS: Array<{ match: string; src: string }> = [
  { match: "instagram", src: "/images/products/services/instagram.svg" },
  { match: "facebook", src: "/images/products/services/facebook.svg" },
  { match: "tiktok", src: "/images/products/services/tiktok.svg" },
  { match: "shopee", src: "/images/products/services/shopee.svg" },
  { match: "tinder", src: "/images/products/services/tinder.svg" },
];

function getServiceIcon(serviceName: string) {
  const normalizedName = serviceName.toLowerCase();
  return SERVICE_ICONS.find(({ match }) => normalizedName.includes(match))?.src;
}

export default function OtpCatalog() {
  const [supplier, setSupplier] = useState<SupplierTab>("smscode");
  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (supplier !== "smscode") return;

    const root = catalogRef.current;
    if (!root) return;

    const applyServiceIcons = () => {
      root.querySelectorAll<HTMLElement>("article").forEach((article) => {
        const title = article.querySelector("h3");
        const serviceName = title?.textContent?.trim() || "";
        const iconSrc = getServiceIcon(serviceName);
        if (!iconSrc) return;

        const badge = title?.parentElement?.previousElementSibling as HTMLElement | null;
        if (!badge || badge.dataset.serviceIcon === iconSrc) return;

        badge.replaceChildren();

        const image = document.createElement("img");
        image.src = iconSrc;
        image.alt = `${serviceName} logo`;
        image.width = 28;
        image.height = 28;
        image.className = "h-7 w-7 object-contain";

        badge.appendChild(image);
        badge.dataset.serviceIcon = iconSrc;
      });
    };

    applyServiceIcons();

    const observer = new MutationObserver(applyServiceIcons);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [supplier]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
              Nomor OTP
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Pilih sumber nomor. Supplier lama tetap tersedia sebagai fallback selama integrasi SMSCode diuji.
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/[0.06]">
            <button
              type="button"
              onClick={() => setSupplier("smscode")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                supplier === "smscode"
                  ? "bg-white text-brand-600 shadow-sm dark:bg-gray-900 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              SMSCode
            </button>
            <button
              type="button"
              onClick={() => setSupplier("nokos")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                supplier === "nokos"
                  ? "bg-white text-brand-600 shadow-sm dark:bg-gray-900 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              Nokos Lama
            </button>
          </div>
        </div>
      </section>

      <div ref={catalogRef}>
        {supplier === "smscode" ? <SMSCodeCatalog /> : <NokosCatalog />}
      </div>
    </div>
  );
}
