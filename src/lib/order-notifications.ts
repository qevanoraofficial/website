"use client";

const ORDER_PAGE_NOTICE_KEY = "digie-store-order-page-notice";

export function setOrderPageNotice(message: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    ORDER_PAGE_NOTICE_KEY,
    String(message || "").slice(0, 300)
  );
}

export function readAndClearOrderPageNotice(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const message = window.sessionStorage.getItem(ORDER_PAGE_NOTICE_KEY) || "";
  window.sessionStorage.removeItem(ORDER_PAGE_NOTICE_KEY);
  return message;
}
