"use client";

import Link from "next/link";
import { useState } from "react";
import BuyProductButton from "@/components/products/BuyProductButton";

type PanelProductConfiguratorProps = {
  productId: string;
  category: string;
  categoryName: string;
  stock: number;
  supplier?: "follow" | "nokos" | "alfaprem" | "manual";
};

const PANEL_PLANS = [
  {
    code: "panel-4gb",
    label: "PANEL 4GB | 1 BULAN",
    price: 2000,
  },
  {
    code: "panel-7gb",
    label: "PANEL 7GB | 1 BULAN",
    price: 5000,
  },
  {
    code: "panel-10gb",
    label: "PANEL 10GB | 1 BULAN",
    price: 7000,
  },
  {
    code: "panel-unlimited",
    label: "PANEL UNLIMITED | 1 BULAN",
    price: 10000,
  },
] as const;

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
  const [selectedPlan, setSelectedPlan] = useState<(typeof PANEL_PLANS)[number]>(PANEL_PLANS[0]);
  const [username, setUsername] = useState("");

  return (
    <>
      <div className="mt-8">
        <label
          htmlFor="panel-username"
          className="block text-sm font-semibold text-gray-800 dark:text-white/90"
        >
          Isi username panel
        </label>

        <input
          id="panel-username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Masukkan username panel"
          maxLength={60}
          autoComplete="off"
          className="mt-3 w-full rounded-xl border border-gray-200 bg-transparent px-4 py-3.5 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-500 dark:border-gray-700 dark:text-white dark:placeholder:text-gray-500"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PANEL_PLANS.map((plan) => {
          const active = selectedPlan.code === plan.code;

          return (
            <button
              key={plan.code}
              type="button"
              onClick={() => setSelectedPlan(plan)}
              className={`rounded-xl border px-4 py-3.5 text-sm font-semibold transition ${
                active
                  ? "border-brand-500 bg-brand-500 text-white shadow-sm"
                  : "border-gray-200 bg-transparent text-gray-700 hover:border-brand-500/50 hover:bg-brand-500/[0.04] dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500/50"
              }`}
            >
              {plan.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-y border-gray-200 py-5 dark:border-gray-800">
        <p className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
          {formatRupiah(selectedPlan.price)}
        </p>

        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          Stok {stock}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <BuyProductButton
          productId={productId}
          productName={selectedPlan.label}
          categoryName={categoryName}
          price={selectedPlan.price}
          stock={stock}
          supplier={supplier}
          panelPlan={selectedPlan.code}
          panelUsername={username}
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
