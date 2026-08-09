"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import {
  EMPTY_CUSTOMER_PROFILE,
  clearCustomerProfile,
  clearLegacyOrderCache,
  hasCustomerIdentityChanged,
  readCustomerProfile,
  saveCustomerProfile,
} from "@/lib/customer-profile";
import type { CustomerProfile } from "@/lib/customer-profile";

const inputClassName =
  "mt-2 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

export default function UserInfoCard() {
  const { isOpen, openModal, closeModal } = useModal();
  const [profile, setProfile] = useState<CustomerProfile>(
    EMPTY_CUSTOMER_PROFILE
  );
  const [draft, setDraft] = useState<CustomerProfile>(
    EMPTY_CUSTOMER_PROFILE
  );
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const saved = readCustomerProfile();

    if (saved) {
      setProfile(saved);
      setDraft(saved);
    }
  }, []);

  const openRegistration = () => {
    setDraft(profile);
    setStatus("");
    openModal();
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setIsSending(true);

    try {
      if (!draft.name.trim() || !draft.whatsapp.trim()) {
        throw new Error("Nama dan WhatsApp wajib diisi.");
      }

      const currentProfile = readCustomerProfile();
      const rotateAccount = hasCustomerIdentityChanged(
        currentProfile,
        draft
      );

      const accountResponse = await fetch("/api/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rotate: rotateAccount,
          profile: {
            name: draft.name,
            telegram: draft.telegram,
            whatsapp: draft.whatsapp,
          },
        }),
      });

      const accountResult = (await accountResponse.json()) as {
        ok?: boolean;
        accountId?: string;
        rotated?: boolean;
        error?: string;
      };

      if (!accountResponse.ok || !accountResult.ok) {
        throw new Error(
          accountResult.error || "Akun aman gagal dibuat."
        );
      }

      if (accountResult.rotated) {
        clearLegacyOrderCache();
      }

      const saved = saveCustomerProfile(
        draft,
        accountResult.accountId || ""
      );
      setProfile(saved);
      setDraft(saved);
      window.dispatchEvent(new Event("qevanora-customer-profile-updated"));
      setStatus(
        accountResult.rotated
          ? "Akun aman berhasil dibuat."
          : "Data akun berhasil diperbarui."
      );
      window.setTimeout(closeModal, 900);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Data profil gagal disimpan."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    setIsSending(true);
    setStatus("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Akun gagal dikeluarkan dari perangkat.");
      }

      clearCustomerProfile();
      setProfile(EMPTY_CUSTOMER_PROFILE);
      setDraft(EMPTY_CUSTOMER_PROFILE);
      window.dispatchEvent(new Event("qevanora-customer-profile-updated"));
      setStatus("Akun sudah dikeluarkan dari perangkat ini.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Akun gagal dikeluarkan."
      );
    } finally {
      setIsSending(false);
    }
  };

  const updateDraft = (field: keyof CustomerProfile, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
            Personal Information
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Nama
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {profile.name || "Belum diisi"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                Telegram
              </p>
              <p className="break-all text-sm font-medium text-gray-800 dark:text-white/90">
                {profile.telegram || "Belum diisi"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                WhatsApp
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {profile.whatsapp || "Belum diisi"}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openRegistration}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
        >
          <svg
            className="fill-current"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2ZM7 11V8H5v3H2v2h3v3h2v-3h3v-2H7Zm8 3c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-5.33 4c.73-1 3.4-2 5.33-2 1.94 0 4.61 1 5.34 2H9.67Z" />
          </svg>
          Edit Profil
        </button>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-11">
          <div className="px-2 pr-14">
            <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
              Profil Pelanggan
            </h4>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
              WhatsApp digunakan sebagai identitas utama akun. Telegram bersifat opsional dan tidak terhubung ke bot.
            </p>
          </div>

          <form className="flex flex-col" onSubmit={handleRegister}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-2 lg:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 lg:col-span-2">
                Nama
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) => updateDraft("name", event.target.value)}
                  className={inputClassName}
                  maxLength={80}
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Telegram (opsional)
                <input
                  type="text"
                  value={draft.telegram}
                  onChange={(event) =>
                    updateDraft("telegram", event.target.value)
                  }
                  className={inputClassName}
                  maxLength={80}
                  placeholder="@username"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                WhatsApp
                <input
                  type="tel"
                  value={draft.whatsapp}
                  onChange={(event) =>
                    updateDraft("whatsapp", event.target.value)
                  }
                  className={inputClassName}
                  maxLength={40}
                  required
                />
              </label>
            </div>

            {status && (
              <p
                className="mt-4 px-2 text-sm leading-6 text-gray-600 dark:text-gray-300"
                aria-live="polite"
              >
                {status}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 px-2 lg:justify-end">
              {profile.name && (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isSending}
                  className="inline-flex items-center justify-center rounded-lg border border-error-300 px-4 py-2.5 text-sm font-medium text-error-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-500/40"
                >
                  Keluar Akun
                </button>
              )}

              <button
                type="button"
                onClick={closeModal}
                disabled={isSending}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
