"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Payload = {
  ok?: boolean;
  orderId?: string;
  productName?: string;
  price?: number;
  status?: "accepted" | "completed" | "cancelled" | "failed";
  providerStatus?: string;
  phone?: string;
  otpCode?: string;
  expiresAt?: string;
  canCancel?: boolean;
  reviewRequired?: boolean;
  manualReviewRequired?: boolean;
  reviewMessage?: string;
  refreshAfterMs?: number;
  newBalance?: number;
  message?: string;
  error?: string;
  code?: string;
};

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

async function readJson(response: Response): Promise<Payload> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Payload) : {};
  } catch {
    return { ok: false, error: `Server mengembalikan respons tidak valid (HTTP ${response.status}).` };
  }
}

export default function SMSCodeOrderStatus({ orderCode }: { orderCode: string }) {
  const [data, setData] = useState<Payload>({});
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/smscode/orders/${encodeURIComponent(orderCode)}`, {
        cache: "no-store",
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Status order gagal dibaca.");
      setData(payload);
      setError("");
      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(
          new CustomEvent("qevanora-wallet-updated", { detail: { balance: payload.newBalance } }),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status order gagal dibaca.");
    } finally {
      setLoading(false);
    }
  }, [orderCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (data.status !== "accepted" && !data.reviewRequired) return;
    const timer = window.setInterval(() => void refresh(), Math.max(5_000, Number(data.refreshAfterMs || 5_000)));
    return () => window.clearInterval(timer);
  }, [data.status, data.reviewRequired, data.refreshAfterMs, refresh]);

  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError("");
    try {
      const response = await fetch(`/api/smscode/orders/${encodeURIComponent(orderCode)}/cancel`, {
        method: "POST",
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Order gagal dibatalkan.");
      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(
          new CustomEvent("qevanora-wallet-updated", { detail: { balance: payload.newBalance } }),
        );
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order gagal dibatalkan.");
    } finally {
      setCancelling(false);
    }
  };

  const copy = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Gagal menyalin otomatis. Tekan lama teks untuk menyalin.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-500">SMSCode OTP</p>
            <h1 className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{data.productName || "Menyiapkan nomor..."}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Order {orderCode}</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold dark:border-gray-700">
            Refresh
          </button>
        </div>

        {typeof data.price === "number" && (
          <div className="mt-5 rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Harga</span>
              <span className="font-black text-gray-900 dark:text-white">{formatRupiah(data.price)}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-5 h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">Nomor virtual</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="break-all text-xl font-black text-gray-900 dark:text-white">{data.phone || "Sedang dialokasikan..."}</span>
                {data.phone && <button type="button" onClick={() => void copy(data.phone || "")} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white">Salin</button>}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400">Kode OTP</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="break-all text-3xl font-black tracking-wider text-brand-500">{data.otpCode || "Menunggu SMS..."}</span>
                {data.otpCode && <button type="button" onClick={() => void copy(data.otpCode || "")} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white">Salin</button>}
              </div>
            </div>

            {data.reviewRequired && (
              <div className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4 text-sm leading-6 text-amber-700 dark:text-amber-300">
                {data.reviewMessage || "Provider belum memberi hasil final. Sistem sedang merekonsiliasi request yang sama; jangan membuat order baru."}
              </div>
            )}

            {data.status === "completed" && (
              <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">OTP diterima. Order selesai.</div>
            )}
            {data.status === "cancelled" && (
              <div className="rounded-2xl border border-gray-300 bg-gray-100 p-4 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-300">Order dibatalkan atau expired. Saldo dikembalikan otomatis.</div>
            )}
          </div>
        )}

        {error && <div className="mt-4 rounded-xl border border-error-500/20 bg-error-500/10 p-3 text-sm text-error-500">{error}</div>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {data.canCancel ? (
            <button type="button" onClick={() => void cancel()} disabled={cancelling} className="rounded-xl border border-error-500/30 px-4 py-3 text-sm font-bold text-error-500 disabled:opacity-50">
              {cancelling ? "Membatalkan..." : "Batalkan & Refund"}
            </button>
          ) : (
            <Link href="/notifications" className="rounded-xl border border-gray-200 px-4 py-3 text-center text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-300">Lihat Notifikasi</Link>
          )}
          <Link href="/products/nokos" className="rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-bold text-white">Kembali ke OTP</Link>
        </div>
      </section>
    </div>
  );
}
