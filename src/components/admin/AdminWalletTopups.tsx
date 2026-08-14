"use client";

import { useEffect } from "react";

export default function AdminWalletTopups() {
  useEffect(() => {
    if (window.location.hash === "#saldo") {
      window.location.replace(
        `${window.location.pathname}${window.location.search}#summary`,
      );
    }
  }, []);

  return null;
}
