"use client";

import Link from "next/link";
import BuyProductButton from "@/components/products/BuyProductButton";

type PanelProductConfiguratorProps = {
  productId: string;
  productName: string;
  category: string;
  categoryName: string;
  price: number;
  stock: number;
  supplier?: "follow" | "nokos" | "alfaprem" | "manual";
};

function formatRupiah(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(value)}`;
}

function getPanelPlanCode(productName: string) {
  const name = productName.toUpperCase();

  if (name.includes("4GB")) return "panel-4gb";
  if (name.includes("7GB")) return "panel-7gb";
  if (name.includes("10GB")) return "panel-10gb";
  return "panel-unlimited";
}

export default function PanelProductConfigurator({
  productId,
  productName,
  category,
  categoryName,
  price,
  stock,
  supplier,
}: PanelProductConfiguratorProps) {
  const panelPlan = getPanelPlanCode(productName);

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-4 border-y border-gray-200 py-5 dark:border-gray-800">
        <p className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
          {formatRupiah(price)}
        </p>

        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          Stok {stock}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <BuyProductButton
          productId={productId}
          productName={productName}
          categoryName={categoryName}
          price={price}
          stock={stock}
          supplier={supplier}
          panelPlan={panelPlan}
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
