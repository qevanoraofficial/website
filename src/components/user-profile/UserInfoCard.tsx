"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import {
  EMPTY_CUSTOMER_PROFILE,
  clearCustomerProfile,
  readCustomerProfile,
  saveCustomerProfile,
} from "@/lib/customer-profile";
import type { CustomerProfile } from "@/lib/customer-profile";
import { createClient } from "@/lib/supabase/client";

const inputClassName =
  "mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function UserInfoCard() {
  const supabase = useMemo(() => createClient(), []);
  const { isOpen, openModal, closeModal } = useModal();
  const [profile, setProfile] = useState<CustomerProfile>(EMPTY_CUSTOMER_PROFILE);
  const [draft, setDraft] = useState<CustomerProfile>(EMPTY_CUSTOMER_PROFILE);
  const [email, setEmail] = useState("");
  const [balance, setBalance] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      setIsLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!active) return;

      if (!user) {
        clearCustomerProfile();
        setIsAuthenticated(false);
        setProfile(EMPTY_CUSTOMER_PROFILE);
        setDraft(EMPTY_CUSTOMER_PROFILE);
        setEmail("");
        setBalance(0);
        setIsLoading(false);
        window.dispatchEvent(new Event("qevanora-customer-profile-updated"));
        return;
      }

      setIsAuthenticated(true);
      setEmail(user.email || "");

      const [{ data: profileRow }, { data: walletRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, phone, telegram_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (!active) return;

      const nextProfile: CustomerProfile = {
        name: profileRow?.display_name || "",
        telegram: profileRow?.telegram_id || "",
        whatsapp: profileRow?.phone || "",
        accountId: user.id.slice(0, 12),
      };

      setProfile(nextProfile);
      setDraft(nextProfile);
      setBalance(Number(walletRow?.balance || 0));

      if (nextProfile.name && nextProfile.whatsapp) {
        try {
          const bridgeResponse = await fetch("/api/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rotate: false,
              profile: {
                name: nextProfile.name,
                telegram: nextProfile.telegram,
                whatsapp: nextProfile.whatsapp,
              },
            }),
          });
          const bridge = (await bridgeResponse.json()) as { accountId?: string };
          const saved = saveCustomerProfile(nextProfile, bridge.accountId || nextProfile.accountId || "");
          setProfile(saved);
          setDraft(saved);
        } catch {
          saveCustomerProfile(nextProfile, nextProfile.accountId || "");
        }
      }

      window.dispatchEvent(new Event("qevanora-customer-profile-updated"));
      setIsLoading(false);
    }

    loadAccount();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(loadAccount, 0);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const openEdit = () => {
    setDraft(profile);
    setStatus("");
    openModal();
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setIsSending(true);

    try {
      if (!draft.name.trim() || !draft.whatsapp.trim()) {
        throw new Error("Nama dan WhatsApp wajib diisi.");
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("Sesi login sudah habis. Silakan masuk kembali.");
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: draft.name.trim(),
          phone: draft.whatsapp.trim(),
          telegram_id: draft.telegram.trim() || null,
        })
        .eq("user_id", userData.user.id);

      if (error) throw error;

      let accountId = userData.user.id.slice(0, 12);
      try {
        const response = await fetch("/api/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rotate: false,
            profile: {
              name: draft.name,
              telegram: draft.telegram,
              whatsapp: draft.whatsapp,
            },
          }),
        });
        const result = (await response.json()) as { accountId?: string };
        accountId = result.accountId || accountId;
      } catch {
        // Bridge order lama tidak boleh menggagalkan update Supabase.
      }

      const saved = saveCustomerProfile(draft, accountId);
      setProfile(saved);
      setDraft(saved);
      window.dispatchEvent(new Event("qevanora-customer-profile-updated"));
      setStatus("Profil QEVANORA berhasil diperbarui.");
      window.setTimeout(closeModal, 800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profil gagal disimpan.");
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    setIsSending(true);
    setStatus("");

    try {
      await supabase.auth.signOut();
      await fetch("/api/account", { method: "DELETE" }).catch(() => undefined);
      clearCustomerProfile();
      setProfile(EMPTY_CUSTOMER_PROFILE);
      setDraft(EMPTY_CUSTOMER_PROFILE);
      setEmail("");
      setBalance(0);
      setIsAuthenticated(false);
      window.dispatchEvent(new Event("qevanora-customer-profile-updated"));
      closeModal();
    } finally {
      setIsSending(false);
    }
  };

  const updateDraft = (field: keyof CustomerProfile, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Memuat akun QEVANORA...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-5 dark:border-brand-500/20 lg:p-6">
        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">Akun QEVANORA</h4>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
          Masuk atau daftar untuk mengaktifkan satu akun QEVANORA, saldo, order, dan refund.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Masuk</Link>
          <Link href="/register" className="inline-flex rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">Daftar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-brand-500/15 bg-brand-500/[0.05] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Saldo QEVANORA</p>
          <p className="mt-2 text-2xl font-bold text-brand-500">{formatRupiah(balance)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Email Akun</p>
          <p className="mt-2 break-all text-sm font-semibold text-gray-800 dark:text-white/90">{email || "-"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">Personal Information</h4>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Nama</p><p className="text-sm font-medium text-gray-800 dark:text-white/90">{profile.name || "Belum diisi"}</p></div>
            <div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Telegram</p><p className="break-all text-sm font-medium text-gray-800 dark:text-white/90">{profile.telegram || "Belum diisi"}</p></div>
            <div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">WhatsApp</p><p className="text-sm font-medium text-gray-800 dark:text-white/90">{profile.whatsapp || "Belum diisi"}</p></div>
            <div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Account ID</p><p className="text-sm font-medium text-gray-800 dark:text-white/90">{profile.accountId || "-"}</p></div>
          </div>
        </div>
        <button type="button" onClick={openEdit} className="flex w-full items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 lg:w-auto">Edit Profil</button>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">Profil QEVANORA</h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Data ini tersimpan di akun Supabase QEVANORA dan digunakan untuk order.</p>
          </div>
          <form className="flex flex-col" onSubmit={handleSave}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-2 lg:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 lg:col-span-2">Nama<input type="text" value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} className={inputClassName} maxLength={80} required /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Telegram (opsional)<input type="text" value={draft.telegram} onChange={(e) => updateDraft("telegram", e.target.value)} className={inputClassName} maxLength={80} placeholder="@username" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp<input type="tel" value={draft.whatsapp} onChange={(e) => updateDraft("whatsapp", e.target.value)} className={inputClassName} maxLength={40} required /></label>
            </div>
            {status && <p className="mt-4 px-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{status}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3 px-2 lg:justify-end">
              <button type="button" onClick={handleLogout} disabled={isSending} className="inline-flex items-center justify-center rounded-lg border border-error-300 px-4 py-2.5 text-sm font-medium text-error-500 disabled:opacity-50 dark:border-error-500/40">Keluar Akun</button>
              <button type="button" onClick={closeModal} disabled={isSending} className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Batal</button>
              <button type="submit" disabled={isSending} className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">{isSending ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
