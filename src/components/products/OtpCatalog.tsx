"use client";

import SMSCodeCatalog from "@/components/products/SMSCodeCatalog";

export default function OtpCatalog() {
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

      <SMSCodeCatalog />
    </div>
  );
}
