"use client";

import Link from "next/link";
import BuyProductButton from "@/components/products/BuyProductButton";

type PanelProductConfiguratorProps = {
  productId: string;
  category: string;
  categoryName: string;
  stock: number;
  supplier?: "follow" | "nokos" | "alfaprem" | "manual";
};

const DEFAULT_PANEL_PLAN = {
  code: "panel-4gb",
  label: "PANEL 4GB | 1 BULAN",
  price: 2000,
} as const;

function formatRupiah(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;
}

export default function PanelProductConfigurator({
  productId,
  category,
  categoryName,
  stock,
  supplier,
}: PanelProductConfiguratorProps) {
  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-4 border-y border-gray-200 py-5 dark:border-gray-800">
        <p className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
          {formatRupiah(DEFAULT_PANEL_PLAN.price)}
        </p>

        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          Stok {stock}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <BuyProductButton
          productId={productId}
          productName={DEFAULT_PANEL_PLAN.label}
          categoryName={categoryName}
          price={DEFAULT_PANEL_PLAN.price}
          stock={stock}
          supplier={supplier}
          panelPlan={DEFAULT_PANEL_PLAN.code}
          panelUsername="-"
        />

        <Link
          href={`/products/${category}`}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Kembali
        </Link>
      </div>
    </>
  );
}
