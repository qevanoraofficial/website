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

function createCheckoutKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `smscode-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `smscode-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

type Props = {
  catalogProductId: number;
  platformId: number;
  countryId: number;
  serviceName: string;
  countryName: string;
  price: number;
  stock: number;
};

export default function SMSCodeBuyButton({
  catalogProductId,
  platformId,
  countryId,
  serviceName,
  countryName,
  price,
  stock,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [checkoutPrice, setCheckoutPrice] = useState(price);
  const [checkoutKey, setCheckoutKey] = useState("");
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
    setCheckoutPrice(price);
    setCheckoutKey("");
    setError("");
    setOpen(true);
  };

  const buy = async () => {
    if (sending) return;
    if (balance < checkoutPrice) {
      setError(`Saldo tidak cukup. Kamu butuh ${formatRupiah(checkoutPrice - balance)} lagi.`);
      return;
    }

    const activeKey = checkoutKey || createCheckoutKey();
    if (!checkoutKey) setCheckoutKey(activeKey);
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/smscode/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": activeKey,
        },
        body: JSON.stringify({
          catalogProductId,
          platformId,
          countryId,
          quotedPrice: checkoutPrice,
          checkoutKey: activeKey,
        }),
      });

      const raw = await response.text();
      let payload: {
        ok?: boolean;
        orderId?: string;
        statusUrl?: string;
        newBalance?: number;
        error?: string;
        message?: string;
        code?: string;
        currentPrice?: number;
        retryWithNewCheckoutKey?: boolean;
      } = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = { ok: false, error: `Checkout gagal diproses (HTTP ${response.status}).` };
      }

      if (
        response.status === 409 &&
        payload.code === "PRICE_CHANGED" &&
        typeof payload.currentPrice === "number"
      ) {
        setCheckoutPrice(payload.currentPrice);
        setError(`Harga berubah menjadi ${formatRupiah(payload.currentPrice)}. Periksa lalu tekan Beli Sekarang lagi.`);
        return;
      }

      if (!response.ok || !payload.ok || !payload.orderId) {
        if (payload.retryWithNewCheckoutKey) setCheckoutKey("");
        throw new Error(payload.error || "Checkout SMSCode gagal.");
      }

      if (typeof payload.newBalance === "number") {
        window.dispatchEvent(
          new CustomEvent("qevanora-wallet-updated", { detail: { balance: payload.newBalance } }),
        );
      }
      setOrderPageNotice(payload.message || `Order ${payload.orderId} berhasil dibuat.`);
      setOpen(false);
      router.push(payload.statusUrl || `/smscode/orders/${encodeURIComponent(payload.orderId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout SMSCode gagal.");
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
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {stock <= 0 ? "Stok Habis" : sending ? "Memproses..." : "Beli OTP"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-[26px] border border-gray-200 bg-white p-5 shadow-2xl dark:border-[#1d3855] dark:bg-[#081625]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-2xl">📱</div>
            <h3 className="mt-4 text-center text-xl font-black text-gray-900 dark:text-white">
              Beli OTP {serviceName}?
            </h3>
            <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">{countryName}</p>
            <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              Harga <span className="font-bold text-brand-500">{formatRupiah(checkoutPrice)}</span>
            </p>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.07] dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">Saldo QEVANORA</span>
                <span className="text-sm font-black text-gray-900 dark:text-white">{formatRupiah(balance)}</span>
              </div>
            </div>

            {balance < checkoutPrice && (
              <p className="mt-3 text-center text-xs leading-5 text-error-500">
                Saldo kurang {formatRupiah(checkoutPrice - balance)}. {" "}
                <Link href="/profile#wallet-center" className="font-semibold underline">Top up saldo</Link> dulu.
              </p>
            )}
            {error && (
              <div className="mt-3 rounded-xl border border-error-500/20 bg-error-500/10 p-3 text-sm leading-5 text-error-500">{error}</div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => !sending && setOpen(false)}
                disabled={sending}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 dark:border-[#27425f] dark:text-gray-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void buy()}
                disabled={sending || balance < checkoutPrice}
                className="rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
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
