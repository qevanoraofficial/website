"use client";

import Image from "next/image";
import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import { readCustomerProfile } from "@/lib/customer-profile";

const DEFAULT_PROFILE_IMAGE = "/images/user/owner.jpg";
const PROFILE_IMAGE_STORAGE_KEY = "digie-store-profile-photo";
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export default function UserMetaCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState(DEFAULT_PROFILE_IMAGE);
  const [message, setMessage] = useState("");
  const [profileName, setProfileName] = useState("Belum diisi");

  useEffect(() => {
    try {
      const savedImage = window.localStorage.getItem(
        PROFILE_IMAGE_STORAGE_KEY
      );

      if (savedImage) {
        setProfileImage(savedImage);
      }
    } catch {
      setMessage("Foto tersimpan tidak dapat dibuka.");
    }
  }, []);

  useEffect(() => {
    const synchronizeProfileName = () => {
      const savedProfile = readCustomerProfile();
      setProfileName(savedProfile?.name || "Belum diisi");
    };

    synchronizeProfileName();
    window.addEventListener("qevanora-customer-profile-updated", synchronizeProfileName);
    window.addEventListener("storage", synchronizeProfileName);

    return () => {
      window.removeEventListener("qevanora-customer-profile-updated", synchronizeProfileName);
      window.removeEventListener("storage", synchronizeProfileName);
    };
  }, []);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Pilih file gambar yang valid.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage("Ukuran foto maksimal 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setMessage("Foto gagal dibaca.");
        return;
      }

      try {
        window.localStorage.setItem(
          PROFILE_IMAGE_STORAGE_KEY,
          reader.result
        );
        setProfileImage(reader.result);
        setMessage("Foto profil berhasil diubah.");
      } catch {
        setMessage("Foto gagal disimpan. Gunakan gambar yang lebih kecil.");
      }
    };

    reader.onerror = () => {
      setMessage("Foto gagal dibaca.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800 lg:p-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative">
          <div className="h-24 w-24 overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800">
            <Image
              width={96}
              height={96}
              src={profileImage}
              alt="Foto profil"
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>

          <button
            type="button"
            onClick={openFilePicker}
            aria-label="Ubah foto profil"
            title="Ubah foto profil"
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow-theme-sm transition hover:bg-brand-600 dark:border-gray-900"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M9 4 7.17 6H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-3.17L15 4H9Zm3 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5Zm0-2.2c1.55 0 2.8-1.25 2.8-2.8S13.55 9.2 12 9.2 9.2 10.45 9.2 12s1.25 2.8 2.8 2.8Z" />
            </svg>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePhotoChange}
            className="hidden"
          />
        </div>

        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {profileName}
          </h4>

          <button
            type="button"
            onClick={openFilePicker}
            className="mt-2 text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Ubah Foto Profil
          </button>

          {message && (
            <p
              className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400"
              aria-live="polite"
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
