"use client";

import SMSCodeCatalogCheckout from "@/components/products/SMSCodeCatalogCheckout";

// Production OTP catalog uses SMSCode only. Legacy Nokos remains backend-only for old order compatibility.
export default function OtpCatalog() {
  return <SMSCodeCatalogCheckout />;
}
