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

function serviceLabel(productName: string) {
  return String(productName || "").split(" - ")[0].trim() || "layanan";
}

type Props = {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  compact?: boolean;
  operator?: string;
};

export default function NokosBuyButton({
  productId,
  productName,
  price,
  stock,
  compact = false,
  operator = "any",
}: Props) {
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
        body: JSON.stringify({
          productId,
          paymentMethod: "wallet",
          operator,
        }),
      });

      const text = await response.text();
      let payload: {
        ok?: boolean;
        orderId?: string;
        newBalance?: number;
        error?: string;
        message?: string;
      } = {};

      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { ok: false, error: `Order gagal diproses (HTTP ${response.status}).` };
      }

      if (!response.ok || !payload.ok || !payload.orderId) {
        throw new Error(payload.error || "Order gagal diproses.");
      }

      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(
          new CustomEvent("qevanora-wallet-updated", {
            detail: { balance: payload.newBalance },
          }),
        );
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
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_38px] gap-2">
          <button
            type="button"
            onClick={() => void prepare()}
            disabled={disabled}
            className="inline-flex h-9 min-w-0 items-center justify-center rounded-lg bg-brand-500 px-3 text-xs font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="mr-1.5 text-xs" aria-hidden="true">↗</span>
            {label}
          </button>
          <button
            type="button"
            onClick={() => void prepare()}
            disabled={disabled}
            aria-label={`Beli ${productName}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-500/45 bg-brand-500/[0.06] text-lg font-light text-brand-500 transition hover:bg-brand-500/10 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-[26px] border border-gray-200 bg-white p-5 shadow-2xl dark:border-[#1d3855] dark:bg-[#081625]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-2xl text-brand-500">
              ?
            </div>

            <h3 className="mt-4 text-center text-xl font-black text-gray-900 dark:text-white">
              Beli OTP {serviceLabel(productName)}?
            </h3>
            <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              Harga <span className="font-bold text-brand-500">{formatRupiah(price)}</span>
            </p>
            <p className="mt-2 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
              Nomor akan dialokasikan otomatis. OTP akan muncul di halaman notifikasi setelah SMS diterima.
            </p>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">Saldo QEVANORA</span>
                <span className="text-sm font-black text-gray-900 dark:text-white">{formatRupiah(balance)}</span>
              </div>
              {operator !== "any" && (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-gray-200 pt-2 dark:border-white/[0.07]">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Operator</span>
                  <span className="text-xs font-bold capitalize text-gray-800 dark:text-gray-200">{operator}</span>
                </div>
              )}
            </div>

            {balance < price && (
              <p className="mt-3 text-center text-xs leading-5 text-error-500">
                Saldo kurang {formatRupiah(price - balance)}.{" "}
                <Link href="/profile#wallet-center" className="font-semibold underline">
                  Top up saldo
                </Link>{" "}
                dulu.
              </p>
            )}

            {error && (
              <div className="mt-3 rounded-xl border border-error-500/20 bg-error-500/10 p-3 text-sm leading-5 text-error-500">
                {error}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => !sending && setOpen(false)}
                disabled={sending}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-[#27425f] dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void buy()}
                disabled={sending || balance < price}
                className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Memproses..." : "Beli Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
