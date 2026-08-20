"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readCustomerProfile } from "@/lib/customer-profile";
import { setOrderPageNotice } from "@/lib/order-notifications";
import { createClient } from "@/lib/supabase/client";

type Props = {
  productId: string;
  productName: string;
  price: number;
  stock: number;
};

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function PremiumAppsBuyButton({ productId, productName, price, stock }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [balance, setBalance] = useState(0);
  const [checkoutPrice, setCheckoutPrice] = useState(price);
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
    setCheckoutPrice(price);
    setError("");
    setOpen(true);
  };

  const buy = async () => {
    if (sending) return;
    if (balance < checkoutPrice) {
      setError(`Saldo tidak cukup. Kamu butuh ${formatRupiah(checkoutPrice - balance)} lagi.`);
      return;
    }

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/premium-apps/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quotedPrice: checkoutPrice }),
      });
      const text = await response.text();
      let payload: {
        ok?: boolean;
        orderId?: string;
        newBalance?: number;
        error?: string;
        message?: string;
        code?: string;
        currentPrice?: number;
      } = {};

      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { ok: false, error: `Order gagal diproses (HTTP ${response.status}).` };
      }

      if (
        response.status === 409 &&
        payload.code === "PRICE_CHANGED" &&
        typeof payload.currentPrice === "number"
      ) {
        setCheckoutPrice(payload.currentPrice);
        setError(`Harga berubah menjadi ${formatRupiah(payload.currentPrice)}. Periksa harga baru lalu tekan Beli Sekarang lagi.`);
        return;
      }

      if (!response.ok || !payload.ok || !payload.orderId) {
        throw new Error(payload.error || "Order Premium Apps gagal diproses.");
      }

      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(
          new CustomEvent("qevanora-wallet-updated", { detail: { balance: payload.newBalance } }),
        );
      }

      setOrderPageNotice(payload.message || `Order ${payload.orderId} berhasil dibuat.`);
      setOpen(false);
      router.push("/notifications");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order Premium Apps gagal diproses.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void prepare()}
        disabled={sending || stock <= 0}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Memproses..." : stock <= 0 ? "Stok Habis" : "Beli"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-[#1d3855] dark:bg-[#081625] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Premium Apps QEVANORA</p>
            <h3 className="mt-2 text-xl font-black text-gray-900 dark:text-white">Beli {productName}?</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Setelah pembayaran berhasil, data akun dari supplier akan dikirim otomatis ke halaman Notifikasi.
            </p>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.07] dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Harga</span>
                <span className="text-lg font-black text-brand-500">{formatRupiah(checkoutPrice)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3 dark:border-white/[0.07]">
                <span className="text-sm text-gray-500 dark:text-gray-400">Saldo QEVANORA</span>
                <span className="font-bold text-gray-900 dark:text-white">{formatRupiah(balance)}</span>
              </div>
            </div>

            {balance < checkoutPrice && (
              <p className="mt-3 text-xs leading-5 text-error-500">
                Saldo kurang {formatRupiah(checkoutPrice - balance)}. <Link href="/profile#wallet-center" className="font-semibold underline">Top up saldo</Link> dulu.
              </p>
            )}

            {error && (
              <div className="mt-3 rounded-xl border border-error-500/20 bg-error-500/10 p-3 text-sm leading-5 text-error-500">{error}</div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => !sending && setOpen(false)} disabled={sending} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 dark:border-[#27425f] dark:text-gray-300">Batal</button>
              <button type="button" onClick={() => void buy()} disabled={sending || balance < checkoutPrice} className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
                {sending ? "Memproses..." : "Beli Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
