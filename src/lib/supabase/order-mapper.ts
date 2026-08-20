export type LegacyOrderStatus =
  | "pending"
  | "accepted"
  | "completed"
  | "cancelled"
  | "failed";

type OrderItemRow = {
  supplier_product_id?: string | null;
  product_name?: string | null;
  unit_price?: number | string | null;
  input_data?: Record<string, unknown> | null;
};

type SupplierOrderRow = {
  supplier_order_id?: string | null;
  status?: string | null;
  response_payload?: Record<string, unknown> | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  user_id?: string;
  status: string;
  created_at: string;
  updated_at: string;
  cancel_reason?: string | null;
  supplier?: string | null;
  customer_data?: Record<string, unknown> | null;
  order_items?: OrderItemRow[] | null;
  supplier_orders?: SupplierOrderRow[] | null;
};

export function toLegacyStatus(status: string): LegacyOrderStatus {
  if (status === "processing") return "accepted";
  if (status === "completed") return "completed";
  if (status === "cancelled" || status === "refunded") return "cancelled";
  if (status === "failed") return "failed";
  return "pending";
}

export function mapOrderForCustomer(row: OrderRow) {
  const item = row.order_items?.[0];
  const input = item?.input_data || {};
  const supplierRow = row.supplier_orders?.[0];
  const supplierPayload = supplierRow?.response_payload || {};
  const supplier = String(row.supplier || "manual");
  const otpCode = String(input.otpCode || supplierPayload.code || "");
  const phone = String(input.phone || supplierPayload.phone || "");
  const expiresAt = String(input.expiresAt || supplierPayload.expires_at || "");
  const activationId = String(input.activationId || supplierRow?.supplier_order_id || "");
  const premiumCredentials = String(
    input.premiumCredentials || supplierPayload.credentials_text || "",
  ).slice(0, 6000);
  const reviewRequired = Boolean(
    input.reconciliationRequired || supplierPayload.reconciliationRequired,
  );
  const manualReviewRequired = Boolean(supplierPayload.manualReviewRequired);
  const reviewMessage = String(
    input.reviewMessage ||
      supplierPayload.reviewMessage ||
      (manualReviewRequired
        ? "Provider belum memberi hasil final setelah beberapa percobaan otomatis. Order diamankan untuk pengecekan admin; jangan membuat order ulang."
        : "Provider belum memberi hasil final. Sistem sedang merekonsiliasi order dengan request yang sama; jangan membuat order ulang."),
  ).slice(0, 1000);

  return {
    id: row.order_code || row.id,
    productId: String(item?.supplier_product_id || ""),
    productName: String(item?.product_name || "Produk QEVANORA"),
    categoryName: String(input.categoryName || input.category_name || "Digital"),
    price: Number(item?.unit_price || 0),
    status: toLegacyStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.cancel_reason || "",
    supplier,
    target: String(input.target || ""),
    quantity: Number(input.quantity || 1),
    service: String(input.service || ""),
    countryName: String(input.countryName || ""),
    phone,
    activationId,
    otpCode,
    sms: String(input.sms || supplierPayload.sms || ""),
    expiresAt,
    premiumCredentials,
    providerOrderId: String(input.providerOrderId || supplierRow?.supplier_order_id || ""),
    reviewRequired,
    manualReviewRequired,
    reviewMessage,
    canCancel:
      supplier === "nokos" &&
      toLegacyStatus(row.status) === "accepted" &&
      !otpCode &&
      Boolean(activationId) &&
      !reviewRequired,
  };
}

export function mapOrderForBot(
  row: OrderRow,
  profile?: {
    display_name?: string | null;
    phone?: string | null;
    telegram_id?: string | null;
  }
) {
  const customer = row.customer_data || {};
  const mapped = mapOrderForCustomer(row);

  return {
    id: mapped.id,
    databaseId: row.id,
    ownerKey: String(row.user_id || "").slice(0, 16),
    productId: mapped.productId,
    productName: mapped.productName,
    categoryName: mapped.categoryName,
    price: mapped.price,
    customerName: String(profile?.display_name || customer.name || ""),
    whatsapp: String(profile?.phone || customer.whatsapp || ""),
    telegram: String(profile?.telegram_id || customer.telegram || ""),
    status: mapped.status,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
    error: mapped.error,
    supplier: mapped.supplier,
    target: mapped.target,
    quantity: mapped.quantity,
    phone: mapped.phone,
    otpCode: mapped.otpCode,
    premiumCredentials: mapped.premiumCredentials,
  };
}
