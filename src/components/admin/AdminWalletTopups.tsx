"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AdminTopup = {
  id: string;
  topup_code: string;
  user_id: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled";
  amount: number | string;
  fee: number | string;
  total_amount: number | string;
  payment_provider?: string | null;
  payment_method?: string | null;
  external_id?: string | null;
  expires_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    display_name?: string | null;
    phone?: string | null;
  } | null;
};

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

function statusLabel(status: AdminTopup["status"]) {
  if (status === "paid") return "BERHASIL";
  if (status === "pending") return "MENUNGGU";
  if (status === "cancelled") return "DIBATALKAN";
  if (status === "expired") return "KEDALUWARSA";
  return "GAGAL";
}

export default function AdminWalletTopups() {
  const [topups, setTopups] = useState<AdminTopup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/qevanora-admin/topups?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        topups?: AdminTopup[];
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Data top up gagal dibaca.");
      }
      setTopups(payload.topups || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data top up gagal dibaca.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(
    () => topups.filter((item) => item.status === "pending").length,
    [topups]
  );
  const paidTotal = useMemo(
    () =>
      topups
        .filter((item) => item.status === "paid")
        .reduce((total, item) => total + Number(item.amount || 0), 0),
    [topups]
  );

  const updateTopup = async (topup: AdminTopup, action: "confirm" | "cancel") => {
    if (busy) return;
    if (
      !window.confirm(
        action === "confirm"
          ? `Konfirmasi pembayaran ${topup.topup_code} sebesar ${formatRupiah(topup.amount)}? Saldo customer akan langsung bertambah.`
          : `Batalkan permintaan ${topup.topup_code}?`
      )
    ) {
      return;
    }

    setBusy(`${action}:${topup.id}`);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/qevanora-admin/topups", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupId: topup.id, action }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Top up gagal diperbarui.");
      }
      setNotice(
        action === "confirm"
          ? `${topup.topup_code} berhasil dikonfirmasi. Saldo customer sudah ditambahkan.`
          : `${topup.topup_code} berhasil dibatalkan.`
      );
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Top up gagal diperbarui.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section id="saldo" className="mt-6 space-y-6 scroll-mt-24">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className="rounded-3xl border border-brand-500/15 bg-[#031126] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Permintaan Menunggu</p>
          <p className="mt-3 text-3xl font-bold text-brand-300">{pendingCount}</p>
        </article>
        <article className="rounded-3xl border border-brand-500/15 bg-[#031126] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Top Up Berhasil</p>
          <p className="mt-3 text-3xl font-bold text-white">{topups.filter((item) => item.status === "paid").length}</p>
        </article>
        <article className="rounded-3xl border border-brand-500/15 bg-[#031126] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Total Saldo Masuk</p>
          <p className="mt-3 text-2xl font-bold text-success-400">{formatRupiah(paidTotal)}</p>
        </article>
      </div>

      <article className="rounded-3xl border border-brand-500/15 bg-[#031126] p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Saldo QEVANORA</p>
            <h2 className="mt-2 text-xl font-bold text-white">Top Up Customer</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">Pembayaran Midtrans diproses otomatis. Tombol konfirmasi manual hanya tersedia untuk top up manual.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-brand-500/25 px-4 py-2.5 text-sm font-semibold text-brand-200 hover:bg-brand-500/10 disabled:opacity-50">Muat Ulang</button>
        </div>

        {notice && <div className="mt-5 rounded-2xl border border-success-500/25 bg-success-500/10 p-4 text-sm text-success-300">{notice}</div>}
        {error && <div className="mt-5 rounded-2xl border border-error-500/25 bg-error-500/10 p-4 text-sm text-error-300">{error}</div>}

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-brand-500/10 p-8 text-center text-sm text-gray-500">Memuat top up...</div>
          ) : topups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-500/15 p-8 text-center text-sm text-gray-500">Belum ada permintaan top up.</div>
          ) : (
            topups.map((topup) => (
              <div key={topup.id} className="rounded-2xl border border-brand-500/10 bg-white/[0.02] p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">{topup.topup_code}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${topup.status === "paid" ? "bg-success-500/10 text-success-400" : topup.status === "pending" ? "bg-warning-500/10 text-warning-400" : "bg-white/5 text-gray-500"}`}>
                        {statusLabel(topup.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-brand-200">{topup.profiles?.display_name || "Customer QEVANORA"}</p>
                    <p className="mt-1 text-xs text-gray-500">WA: {topup.profiles?.phone || "-"} · User {topup.user_id.slice(0, 12)}</p>
                    <p className="mt-1 text-xs text-gray-600">Dibuat {formatDate(topup.created_at)}</p>
                    {topup.expires_at && topup.status === "pending" && <p className="mt-1 text-xs text-gray-600">Kedaluwarsa {formatDate(topup.expires_at)}</p>}
                  </div>

                  <div className="sm:text-right">
                    <p className="text-2xl font-bold text-white">{formatRupiah(topup.amount)}</p>
                    <p className="mt-1 text-xs text-gray-500">{topup.payment_provider || "manual"} · {topup.payment_method || "admin_confirmation"}</p>
                  </div>
                </div>

                {topup.status === "pending" && topup.payment_provider === "midtrans" && (
                  <div className="mt-4 rounded-xl border border-brand-500/15 bg-brand-500/[0.06] p-3 text-sm text-brand-200">
                    Pembayaran dikelola otomatis oleh Midtrans. Saldo akan masuk setelah webhook pembayaran terverifikasi.
                  </div>
                )}

                {topup.status === "pending" && topup.payment_provider !== "midtrans" && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-brand-500/10 pt-4 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => void updateTopup(topup, "cancel")} disabled={Boolean(busy)} className="rounded-xl border border-error-500/25 px-4 py-2.5 text-sm font-semibold text-error-300 hover:bg-error-500/10 disabled:opacity-50">
                      {busy === `cancel:${topup.id}` ? "Membatalkan..." : "Batalkan"}
                    </button>
                    <button type="button" onClick={() => void updateTopup(topup, "confirm")} disabled={Boolean(busy)} className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-[#031126] hover:bg-brand-400 disabled:opacity-50">
                      {busy === `confirm:${topup.id}` ? "Mengonfirmasi..." : "Konfirmasi Pembayaran"}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
