"use client";

import { useEffect, useRef } from "react";
import SMSCodeCatalog from "@/components/products/SMSCodeCatalog";

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
  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = catalogRef.current;
    if (!root) return;

    const applyServiceIcons = () => {
      root.querySelectorAll<HTMLElement>("article").forEach((article) => {
        const serviceName = article.querySelector("h3")?.textContent?.trim() || "";
        const iconSrc = getServiceIcon(serviceName);
        if (!iconSrc) return;

        const title = article.querySelector("h3");
        const badge = title?.parentElement?.previousElementSibling as HTMLElement | null;
        if (!badge) return;

        if (badge.dataset.serviceIcon === iconSrc) return;

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
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
            Nomor OTP
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            SMSCode memakai harga dan stok live.
          </p>
        </div>
      </section>

      <div ref={catalogRef}>
        <SMSCodeCatalog />
      </div>
    </div>
  );
}
