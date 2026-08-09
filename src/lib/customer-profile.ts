"use client";

export const CUSTOMER_PROFILE_STORAGE_KEY = "digie-store-customer-profile";
export const LEGACY_ORDER_STORAGE_KEY = "digie-store-order-notifications";

export type CustomerProfile = {
  name: string;
  telegram: string;
  whatsapp: string;
  accountId?: string;
};

export const EMPTY_CUSTOMER_PROFILE: CustomerProfile = {
  name: "",
  telegram: "",
  whatsapp: "",
  accountId: "",
};

function normalizeText(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeProfile(
  value: Partial<CustomerProfile>
): CustomerProfile {
  return {
    name: normalizeText(value.name, 80),
    telegram: normalizeText(value.telegram, 80),
    whatsapp: normalizeText(value.whatsapp, 40),
    accountId: normalizeText(value.accountId, 32),
  };
}

function whatsappIdentity(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function readCustomerProfile(): CustomerProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CUSTOMER_PROFILE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const profile = normalizeProfile(
      JSON.parse(raw) as Partial<CustomerProfile>
    );

    return profile.name && profile.whatsapp ? profile : null;
  } catch {
    return null;
  }
}

export function saveCustomerProfile(
  profile: CustomerProfile,
  accountId = ""
): CustomerProfile {
  const normalized = normalizeProfile({ ...profile, accountId });

  if (!normalized.name || !normalized.whatsapp) {
    throw new Error("Nama dan WhatsApp wajib diisi.");
  }

  window.localStorage.setItem(
    CUSTOMER_PROFILE_STORAGE_KEY,
    JSON.stringify(normalized)
  );

  return normalized;
}

export function hasCustomerIdentityChanged(
  current: CustomerProfile | null,
  next: CustomerProfile
): boolean {
  if (!current) {
    return true;
  }

  return (
    whatsappIdentity(current.whatsapp) !==
    whatsappIdentity(next.whatsapp)
  );
}

export function clearLegacyOrderCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(LEGACY_ORDER_STORAGE_KEY);
}

export function clearCustomerProfile(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CUSTOMER_PROFILE_STORAGE_KEY);
  clearLegacyOrderCache();
}
