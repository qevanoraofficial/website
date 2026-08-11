"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readCustomerProfile } from "@/lib/customer-profile";
import { setOrderPageNotice } from "@/lib/order-notifications";
import { createClient } from "@/lib/supabase/client";

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

type Props = {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  compact?: boolean;
};

export default function NokosBuyButton({ productId, productName, price, stock, compact = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const prepare = async () => {
    if (sending || stock <= 0) return;
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setOrderPageNotice("Silakan masuk ke akun QEVANORA terlebih dahulu.");
      router.push("/login");
      return;
    }
    if (!readCustomerProfile()) {
      setOrderPageNotice("Lengkapi Nama dan WhatsApp pada halaman Profile Account terlebih dahulu.");
      router.push("/profile");
      return;
    }
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    setBalance(Number(wallet?.balance || 0));
    setError("");
    setOpen(true);
  };

  const buy = async () => {
    if (sending) return;
    if (balance < price) {
      setError(`Saldo tidak cukup. Kamu butuh ${formatRupiah(price - balance)} lagi.`);
      return;
    }

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, paymentMethod: "wallet" }),
      });
      const text = await response.text();
      let payload: { ok?: boolean; orderId?: string; newBalance?: number; error?: string; message?: string } = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { ok: false, error: `Order gagal diproses (HTTP ${response.status}).` };
      }
      if (!response.ok || !payload.ok || !payload.orderId) {
        throw new Error(payload.error || "Order gagal diproses.");
      }
      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(new CustomEvent("qevanora-wallet-updated", { detail: { balance: payload.newBalance } }));
      }
      setOrderPageNotice(payload.message || `Order ${payload.orderId} berhasil dibuat.`);
      setOpen(false);
      router.push("/notifications");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order gagal diproses.");
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || stock <= 0;
  const label = sending ? "Memproses..." : stock <= 0 ? "Stok Habis" : compact ? "Beli" : "Pilih Layanan";

  return (
    <>
      {compact ? (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_42px] gap-2">
          <button
            type="button"
            onClick={() => void prepare()}
            disabled={disabled}
            className="inline-flex h-10 min-w-0 items-center justify-center rounded-xl bg-brand-500 px-3 text-xs font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="mr-1.5 text-sm" aria-hidden="true">↗</span>
            {label}
          </button>
          <button
            type="button"
            onClick={() => void prepare()}
            disabled={disabled}
            aria-label={`Beli ${productName}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/45 bg-brand-500/[0.06] text-xl font-light text-brand-500 transition hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={disabled}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {label}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-[#071321] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Pembayaran QEVANORA</p>
                <h3 className="mt-2 text-xl font-bold text-gray-800 dark:text-white">Detail Order Nokos</h3>
              </div>
              <button type="button" onClick={() => !sending && setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-lg text-gray-500 dark:border-gray-700 dark:text-gray-300">×</button>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{productName}</p>
              <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Setelah pembayaran berhasil, nomor akan diterbitkan otomatis dan OTP akan tampil di halaman notifikasi.
              </p>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
                <span className="text-xl font-bold text-brand-500">{formatRupiah(price)}</span>
              </div>
            </div>

            <button type="button" onClick={() => void buy()} disabled={sending || balance < price} className="mt-4 w-full rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-4 text-left transition hover:border-brand-500/50 disabled:cursor-not-allowed disabled:opacity-55">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white/90">💰 Saldo QEVANORA</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Saldo kamu: {formatRupiah(balance)}</p>
                </div>
                <span className="text-sm font-bold text-brand-500">Bayar</span>
              </div>
            </button>

            {balance < price && (
              <p className="mt-2 text-xs leading-5 text-error-500">
                Saldo kurang {formatRupiah(price - balance)}. <Link href="/profile#wallet-center" className="font-semibold underline">Top up saldo</Link> dulu.
              </p>
            )}
            {error && <div className="mt-3 rounded-xl border border-error-500/20 bg-error-500/10 p-3 text-sm leading-5 text-error-500">{error}</div>}
          </div>
        </div>
      )}
    </>
  );
}
