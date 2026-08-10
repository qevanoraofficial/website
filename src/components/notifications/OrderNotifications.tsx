"use client";

import { useCallback, useEffect, useState } from "react";
import { readAndClearOrderPageNotice } from "@/lib/order-notifications";

type OrderStatus = "pending" | "accepted" | "completed" | "cancelled" | "failed";

type UserOrder = {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  error?: string;
};

const statusPresentation: Record<
  OrderStatus,
  {
    title: string;
    message: string;
    titleClassName: string;
  }
> = {
  pending: {
    title: "Order sedang dikonfirmasi",
    message:
      "Admin sedang memeriksa order kamu. Status akan berubah otomatis saat order diterima, selesai, atau dibatalkan.",
    titleClassName: "text-brand-500 dark:text-brand-400",
  },
  accepted: {
    title: "Order diterima",
    message:
      "Admin sudah menerima order kamu dan sedang memprosesnya. Status akan berubah otomatis setelah order selesai atau dibatalkan.",
    titleClassName: "text-brand-500 dark:text-brand-400",
  },
  completed: {
    title: "Order selesai",
    message:
      "Admin sudah menyelesaikan order kamu. Silakan cek WhatsApp atau hubungi Support untuk informasi berikutnya.",
    titleClassName: "text-success-600 dark:text-success-500",
  },
  cancelled: {
    title: "Order dibatalkan",
    message:
      "Admin membatalkan order ini. Hubungi Support apabila kamu membutuhkan bantuan.",
    titleClassName: "text-error-500",
  },
  failed: {
    title: "Order gagal",
    message: "Order gagal disimpan atau diproses.",
    titleClassName: "text-error-500",
  },
};

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PendingAnimation() {
  return (
    <span
      className="relative flex h-10 w-10 shrink-0 items-center justify-center"
      aria-label="Sedang dikonfirmasi"
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-20" />
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
        <svg
          className="h-5 w-5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-25"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}

export default function OrderNotifications() {
  const [orders, setOrders] = useState<UserOrder[] | null>(null);
  const [notice, setNotice] = useState("");

  const syncOrders = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders?t=${Date.now()}`, {
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        orders?: UserOrder[];
        error?: string;
      };

      if (!response.ok || !payload.ok || !Array.isArray(payload.orders)) {
        throw new Error(payload.error || "Notifikasi order gagal dibaca.");
      }

      setOrders(payload.orders);
    } catch (error) {
      setOrders((current) => current || []);
      setNotice((current) =>
        current ||
        (error instanceof Error
          ? error.message
          : "Notifikasi order gagal dibaca.")
      );
    }
  }, []);

  useEffect(() => {
    setNotice(readAndClearOrderPageNotice());
    void syncOrders();

    const interval = window.setInterval(() => {
      void syncOrders();
    }, 5000);

    const handleFocus = () => {
      void syncOrders();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncOrders]);

  if (orders === null) {
    return (
      <section className="min-h-[420px] animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" />
    );
  }

  if (orders.length === 0) {
    return (
      <div className="space-y-4">
        {notice && (
          <div className="rounded-2xl border border-error-200 bg-error-50 p-4 text-sm leading-6 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {notice}
          </div>
        )}

        <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03] sm:px-8">
          <div className="max-w-md">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
              <svg
                width="30"
                height="30"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
                  fill="currentColor"
                />
              </svg>
            </span>

            <h2 className="mt-5 text-lg font-semibold text-gray-800 dark:text-white/90">
              Belum ada notifikasi
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Halaman ini hanya menampilkan order milik akun yang sedang aktif.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div className="rounded-2xl border border-error-200 bg-error-50 p-4 text-sm leading-6 text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {notice}
        </div>
      )}

      {orders.map((order) => {
        const presentation = statusPresentation[order.status];
        const message =
          order.status === "failed" && order.error
            ? order.error
            : presentation.message;

        return (
          <article
            key={order.id}
            className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                {order.status === "pending" && <PendingAnimation />}

                <div className="min-w-0">
                  <p
                    className={`text-sm font-semibold ${presentation.titleClassName}`}
                  >
                    {presentation.title}
                  </p>
                  <h2 className="mt-2 break-words text-lg font-semibold text-gray-800 dark:text-white/90">
                    {order.productName}
                  </h2>
                </div>
              </div>

              <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {order.categoryName}
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {message}
            </p>

            <div className="mt-5 flex items-end justify-between gap-4 border-t border-gray-200 pt-4 dark:border-gray-800">
              <div>
                <p className="text-xs text-gray-400">
                  {formatDate(order.updatedAt || order.createdAt)}
                </p>
                <p className="mt-1 break-all text-xs text-gray-400">
                  ID: {order.id}
                </p>
              </div>
              <p className="text-base font-semibold text-gray-800 dark:text-white/90">
                {formatRupiah(order.price)}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
