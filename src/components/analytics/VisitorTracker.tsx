"use client";

import { useEffect } from "react";

export default function VisitorTracker() {
  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/visitor", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      signal: controller.signal,
    }).catch(() => {
      // Statistik tidak boleh mengganggu halaman publik ketika layanan gagal.
    });

    return () => controller.abort();
  }, []);

  return null;
}
