"use client";

import { useCallback, useEffect, useState } from "react";

type WalletTransaction = {
  id: string;
  transaction_type: "deposit" | "purchase" | "refund" | "adjustment" | "bonus";
  direction: "credit" | "debit";
  amount: number | string;
  balance_before: number | string;
  balance_after: number | string;
  reference_id?: string | null;
  created_at: string;
};

type Topup = {
  id: string;
  topup_code: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  amount: number | string;
  fee: number | string;
  total_amount: number | string;
  created_at: string;
  paid_at?: string | null;
  expires_at?: string | null;
  payment_provider?: string | null;
  payment_method?: string | null;
  checkout_url?: string | null;
  qr_string?: string | null;
};

type WalletPayload = {
  ok?: boolean;
  balance?: number;
  transactions?: WalletTransaction[];
  topups?: Topup[];
  error?: string;
};

const quickAmounts = [10_000, 25_000, 50_000, 100_000, 250_000];

function formatRupiah(value: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function transactionLabel(type: WalletTransaction["transaction_type"]) {
  if (type === "deposit") return "Top Up Saldo";
  if (type === "purchase") return "Pembelian";
  if (type === "refund") return "Refund Order";
  if (type === "bonus") return "Bonus";
  return "Penyesuaian Saldo";
}

function topupStatus(status: Topup["status"]) {
  if (status === "paid") return "BERHASIL";
  if (status === "pending") return "MENUNGGU";
  if (status === "expired") return "KEDALUWARSA";
  if (status === "cancelled") return "DIBATALKAN";
  return "GAGAL";
}

function safePaymentUrl(value?: string | null) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}

export default function WalletCenter() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [amount, setAmount] = useState("50000");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadWallet = useCallback(async () => {
    try {
      const response = await fetch(`/api/wallet?t=${Date.now()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as WalletPayload;

      if (response.status === 401) {
        setBalance(0);
        setTransactions([]);
        setTopups([]);
        return;
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Data saldo gagal dibaca.");
      }

      setBalance(Number(payload.balance || 0));
      setTransactions(payload.transactions || []);
      setTopups(payload.topups || []);
      window.dispatchEvent(new CustomEvent("qevanora-wallet-updated", {
        detail: { balance: Number(payload.balance || 0) },
      }));
    } catch (walletError) {
      setError(walletError instanceof Error ? walletError.message : "Data saldo gagal dibaca.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWallet();

    const onFocus = () => void loadWallet();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadWallet]);

  useEffect(() => {
    const hasPendingGateway = topups.some(
      (topup) =>
        topup.status === "pending" &&
        (topup.payment_provider === "komerce" || topup.payment_provider === "midtrans")
    );
    if (!hasPendingGateway) return;

    const timer = window.setInterval(() => {
      void loadWallet();
    }, 8000);

    return () => window.clearInterval(timer);
  }, [loadWallet, topups]);

  const requestTopup = async () => {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    setError("");

    try {
      const nominal = Math.round(Number(amount));
      const response = await fetch("/api/wallet/topups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: nominal }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        topup?: { topup_code?: string; checkout_url?: string | null; qr_string?: string | null };
        checkout_url?: string | null;
        qr_string?: string | null;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Permintaan top up gagal dibuat.");
      }

      const checkoutUrl = safePaymentUrl(payload.checkout_url || payload.topup?.checkout_url);
      setMessage(
        `${payload.topup?.topup_code ? `Kode ${payload.topup.topup_code}. ` : ""}${payload.message || "Pembayaran top up berhasil dibuat."}`
      );
      await loadWallet();

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (topupError) {
      setError(topupError instanceof Error ? topupError.message : "Permintaan top up gagal dibuat.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyQris = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Kode QRIS berhasil disalin.");
    } catch {
      setError("Kode QRIS gagal disalin dari browser ini.");
    }
  };

  return (
    <section id="wallet-center" className="scroll-mt-24 space-y-6">
      <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Dompet QEVANORA</p>
            <h4 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">Top Up Saldo</h4>
          </div>
          <div className="rounded-xl border border-brand-500/15 bg-brand-500/[0.05] px-4 py-3 sm:min-w-44 sm:text-right">
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">Saldo Aktif</p>
            <p className="mt-1 text-xl font-bold text-brand-500">{loading ? "..." : formatRupiah(balance)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Nominal Top Up
            <input
              type="number"
              min="10000"
              max="10000000"
              step="1000"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-transparent px-4 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
              placeholder="50000"
            />
          </label>
          <button
            type="button"
            onClick={requestTopup}
            disabled={submitting}
            className="self-end rounded-xl bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Membuat Pembayaran..." : "Top Up"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {quickAmounts.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand-500/40 hover:text-brand-500 dark:border-gray-800 dark:text-gray-300"
            >
              {formatRupiah(value)}
            </button>
          ))}
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-success-500/20 bg-success-500/10 p-4 text-sm leading-6 text-success-600 dark:text-success-400">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-error-500/20 bg-error-500/10 p-4 text-sm leading-6 text-error-600 dark:text-error-400">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">Riwayat Saldo</h4>
            <button type="button" onClick={() => void loadWallet()} className="text-xs font-semibold text-brand-500 hover:text-brand-600">Muat Ulang</button>
          </div>

          <div className="mt-5 space-y-3">
            {transactions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">Belum ada transaksi saldo.</p>
            ) : (
              transactions.map((transaction) => {
                const credit = transaction.direction === "credit";
                return (
                  <article key={transaction.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 dark:text-white/90">{transactionLabel(transaction.transaction_type)}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(transaction.created_at)}</p>
                        {transaction.reference_id && <p className="mt-1 break-all text-xs text-gray-400">Ref: {transaction.reference_id}</p>}
                      </div>
                      <p className={`shrink-0 font-bold ${credit ? "text-success-600 dark:text-success-400" : "text-error-500"}`}>
                        {credit ? "+" : "-"}{formatRupiah(transaction.amount)}
                      </p>
                    </div>
                    <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                      Saldo setelah transaksi: <span className="font-semibold text-gray-700 dark:text-gray-200">{formatRupiah(transaction.balance_after)}</span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">Permintaan Top Up</h4>
          <div className="mt-5 space-y-3">
            {topups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">Belum ada permintaan top up.</p>
            ) : (
              topups.map((topup) => {
                const checkoutUrl = safePaymentUrl(topup.checkout_url);
                const qrUrl = safePaymentUrl(topup.qr_string);
                const hasRawQris = Boolean(topup.qr_string && !qrUrl);

                return (
                  <article key={topup.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-white/90">{topup.topup_code}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(topup.created_at)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${topup.status === "paid" ? "bg-success-500/10 text-success-600 dark:text-success-400" : topup.status === "pending" ? "bg-warning-500/10 text-warning-600 dark:text-warning-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                        {topupStatus(topup.status)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <p>Nominal {formatRupiah(topup.amount)}</p>
                        {topup.payment_provider && <p className="mt-1">Gateway: {topup.payment_provider.toUpperCase()}</p>}
                        {topup.payment_method && <p className="mt-1">Metode: {topup.payment_method.toUpperCase()}</p>}
                        {topup.status === "pending" && topup.expires_at && <p className="mt-1">Berlaku sampai {formatDate(topup.expires_at)}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <p className="font-bold text-gray-800 dark:text-white/90">{formatRupiah(topup.total_amount)}</p>
                        {topup.status === "pending" && checkoutUrl && (
                          <button
                            type="button"
                            onClick={() => { window.location.href = checkoutUrl; }}
                            className="rounded-lg bg-brand-500 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-brand-600"
                          >
                            Bayar Sekarang
                          </button>
                        )}
                        {topup.status === "pending" && !checkoutUrl && qrUrl && (
                          <button
                            type="button"
                            onClick={() => { window.location.href = qrUrl; }}
                            className="rounded-lg bg-brand-500 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-brand-600"
                          >
                            Buka QRIS
                          </button>
                        )}
                        {topup.status === "pending" && !checkoutUrl && hasRawQris && topup.qr_string && (
                          <button
                            type="button"
                            onClick={() => void copyQris(topup.qr_string || "")}
                            className="rounded-lg border border-brand-500/30 px-3 py-2 text-[11px] font-bold text-brand-500 transition hover:bg-brand-500/5"
                          >
                            Salin Kode QRIS
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
