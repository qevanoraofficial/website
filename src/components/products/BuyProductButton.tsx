"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readCustomerProfile } from "@/lib/customer-profile";
import { setOrderPageNotice } from "@/lib/order-notifications";
import { createClient } from "@/lib/supabase/client";

type BuyProductButtonProps = {
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  stock: number;
};

type PaymentMethod = "wallet" | "manual";

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function BuyProductButton({
  productId,
  productName,
  categoryName,
  price,
  stock,
}: BuyProductButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [modalError, setModalError] = useState("");

  const openNotifications = () => {
    router.push("/notifications");
  };

  const prepareBuy = async () => {
    if (isSending) return;

    if (stock <= 0) {
      setOrderPageNotice("Stok produk sedang habis.");
      openNotifications();
      return;
    }

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setOrderPageNotice("Silakan masuk ke akun QEVANORA terlebih dahulu.");
      router.push("/login");
      return;
    }

    const profile = readCustomerProfile();
    if (!profile) {
      setOrderPageNotice(
        "Lengkapi Nama dan WhatsApp pada halaman Profile Account terlebih dahulu."
      );
      router.push("/profile");
      return;
    }

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    setBalance(Number(wallet?.balance || 0));
    setModalError("");
    setIsOpen(true);
  };

  const submitOrder = async (paymentMethod: PaymentMethod) => {
    if (isSending) return;

    if (paymentMethod === "wallet" && balance < price) {
      setModalError(
        `Saldo tidak cukup. Kamu butuh ${formatRupiah(price - balance)} lagi.`
      );
      return;
    }

    setIsSending(true);
    setModalError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, paymentMethod }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        orderId?: string;
        newBalance?: number;
        error?: string;
        message?: string;
      };

      if (!response.ok || !payload.ok || !payload.orderId) {
        throw new Error(payload.error || "Order gagal disimpan.");
      }

      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(
          new CustomEvent("qevanora-wallet-updated", {
            detail: { balance: payload.newBalance },
          })
        );
      }

      setOrderPageNotice(
        payload.message ||
          `Order ${payload.orderId} berhasil dibuat dan sedang menunggu konfirmasi admin.`
      );
      setIsOpen(false);
      openNotifications();
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "Order gagal disimpan. Silakan coba kembali."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={prepareBuy}
        disabled={isSending || stock <= 0}
        className="inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSending ? "Memproses..." : stock > 0 ? "Beli" : "Stok Habis"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Pilih pembayaran">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-[#071321] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Pembayaran QEVANORA</p>
                <h3 className="mt-2 text-xl font-bold text-gray-800 dark:text-white">Pilih metode pembayaran</h3>
              </div>
              <button type="button" onClick={() => !isSending && setIsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-lg text-gray-500 dark:border-gray-700 dark:text-gray-300">×</button>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{productName}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{categoryName}</p>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
                <span className="text-xl font-bold text-brand-500">{formatRupiah(price)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void submitOrder("wallet")}
              disabled={isSending || balance < price}
              className="mt-4 w-full rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-4 text-left transition hover:border-brand-500/50 disabled:cursor-not-allowed disabled:opacity-55"
            >
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

            <button
              type="button"
              onClick={() => void submitOrder("manual")}
              disabled={isSending}
              className="mt-3 w-full rounded-2xl border border-gray-200 p-4 text-left transition hover:border-brand-500/35 dark:border-gray-800"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white/90">🧾 Konfirmasi Admin</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Order dibuat tanpa memotong saldo. Pembayaran dikonfirmasi manual.</p>
                </div>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Manual</span>
              </div>
            </button>

            <div className="mt-3 rounded-xl border border-dashed border-gray-200 p-3 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Payment gateway otomatis belum diaktifkan. Struktur ini sudah siap untuk ditambahkan nanti.
            </div>

            {modalError && (
              <div className="mt-3 rounded-xl border border-error-500/20 bg-error-500/10 p-3 text-sm leading-5 text-error-500">
                {modalError}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
