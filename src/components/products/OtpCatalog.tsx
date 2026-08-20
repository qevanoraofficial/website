"use client";

import { useState } from "react";
import NokosCatalog from "@/components/products/NokosCatalog";
import SMSCodeCatalogCheckout from "@/components/products/SMSCodeCatalogCheckout";

type SupplierTab = "smscode" | "nokos";

export default function OtpCatalog() {
  const [supplier, setSupplier] = useState<SupplierTab>("smscode");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90 sm:text-2xl">
              Nomor OTP
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              SMSCode memakai harga dan stok live. Supplier Nokos lama tetap tersedia sebagai fallback.
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

      {supplier === "smscode" ? <SMSCodeCatalogCheckout /> : <NokosCatalog />}
    </div>
  );
}
