import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createNokosActivation,
  finishNokosActivation,
  getNokosActivationStatus,
  isAmbiguousNokosError,
} from "@/lib/nokos";

type AdminClient = SupabaseClient;

const NOKOS_SYNC_INTERVAL_MS = 5_000;

type SupplierRow = {
  id: string;
  order_id: string;
  supplier_order_id: string | null;
  status: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  updated_at?: string | null;
  recovery_locked_until?: string | null;
  recovery_attempts?: number | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
};

type ClaimedRecoveryRow = {
  supplier_row_id: string;
  order_id: string;
  order_code: string;
  user_id: string;
  order_status: string;
  payment_status: string;
  payment_method: string | null;
  supplier_order_id: string | null;
  supplier_status: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  supplier_updated_at?: string | null;
  recovery_attempts?: number | null;
  recovery_locked_until?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorText(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Unknown error")).slice(0, 2000);
}

async function mergeOrderInput(
  admin: AdminClient,
  orderId: string,
  patch: Record<string, unknown>,
) {
  const { data: item, error: readError } = await admin
    .from("order_items")
    .select("input_data")
    .eq("order_id", orderId)
    .maybeSingle();
  if (readError) throw readError;

  const current = asRecord(item?.input_data);
  const { error: updateError } = await admin
    .from("order_items")
    .update({ input_data: { ...current, ...patch } })
    .eq("order_id", orderId);
  if (updateError) throw updateError;
}

async function releaseRecoveryLease(
  admin: AdminClient,
  supplierId: string,
  lastError: string | null = null,
) {
  const { error } = await admin
    .from("supplier_orders")
    .update({
      recovery_locked_until: null,
      recovery_last_at: new Date().toISOString(),
      recovery_last_error: lastError,
    })
    .eq("id", supplierId);
  if (error) console.error(`[nokos] release recovery lease ${supplierId} gagal`, error);
}

async function markManualReview(
  admin: AdminClient,
  supplier: SupplierRow,
  message: string,
) {
  const request = supplier.request_payload || {};
  const response = supplier.response_payload || {};
  const now = new Date().toISOString();
  const { error } = await admin
    .from("supplier_orders")
    .update({
      status: "processing",
      error_message: message,
      request_payload: { ...request, reconciliationRequired: true },
      response_payload: {
        ...response,
        reconciliationRequired: true,
        manualReviewRequired: true,
        reviewMessage: message,
      },
      recovery_locked_until: null,
      recovery_last_at: now,
      recovery_last_error: message,
      updated_at: now,
    })
    .eq("id", supplier.id);
  if (error) throw error;
}


async function refund(admin: AdminClient, order: OrderRow, reason: string) {
  if (order.payment_method !== "wallet" || order.payment_status !== "paid") return;
  await admin.rpc("refund_order_to_wallet", {
    p_order_id: order.id,
    p_reason: reason,
  });
}

async function reconcileMissingActivation(
  admin: AdminClient,
  supplier: SupplierRow,
  order: OrderRow,
) {
  const request = supplier.request_payload || {};
  const response = supplier.response_payload || {};

  if (!request.reconciliationRequired && !response.reconciliationRequired) return;

  const attempts = Math.max(
    0,
    Math.trunc(Number(response.reconcileAttempts || 0)),
  );
  if (attempts >= 3) return;

  const service = String(request.service || "").trim();
  const country = Number(request.country);
  const server =
    request.server === "s1" ? "s1" : request.server === "s2" ? "s2" : null;
  const operator = String(request.operator || "any").trim() || "any";
  const providerIdempotencyKey = String(
    request.providerIdempotencyKey || response.providerIdempotencyKey || "",
  ).trim();

  if (
    !service ||
    !Number.isInteger(country) ||
    country < 0 ||
    !server ||
    !providerIdempotencyKey
  ) {
    console.error("[nokos] data rekonsiliasi tidak lengkap", {
      orderCode: order.order_code,
      supplierId: supplier.id,
    });
    return;
  }

  const nextAttempt = attempts + 1;
  const updatedAt = new Date().toISOString();

  try {
    const activation = await createNokosActivation({
      service,
      country,
      server,
      operator,
      idempotencyKey: providerIdempotencyKey,
    });

    const actualProviderPrice = Math.max(
      0,
      Math.round(Number(activation.price || request.quotedProviderPrice || 0)),
    );
    const quotedProviderPrice = Math.max(
      0,
      Math.round(Number(request.quotedProviderPrice || 0)),
    );
    const providerPriceDrift =
      actualProviderPrice > 0 && quotedProviderPrice > 0
        ? actualProviderPrice - quotedProviderPrice
        : 0;

    const nextRequest = {
      ...request,
      reconciliationRequired: false,
      reconciledAt: updatedAt,
    };
    const nextResponse = {
      ...response,
      ...activation,
      reconciliationRequired: false,
      manualReviewRequired: false,
      reconcileAttempts: nextAttempt,
      reconciledAt: updatedAt,
      actual_provider_price: actualProviderPrice,
      quoted_provider_price: quotedProviderPrice,
      provider_price_drift: providerPriceDrift,
    };

    const { error: supplierError } = await admin
      .from("supplier_orders")
      .update({
        supplier_order_id: activation.activation_id,
        status: "processing",
        cost_amount: actualProviderPrice,
        request_payload: nextRequest,
        response_payload: nextResponse,
        error_message: null,
        updated_at: updatedAt,
      })
      .eq("id", supplier.id);
    if (supplierError) throw supplierError;

    const { error: itemError } = await admin
      .from("order_items")
      .update({
        input_data: {
          ...nextRequest,
          phone: activation.phone,
          activationId: activation.activation_id,
          expiresAt: String(activation.expires_at || ""),
          actualProviderPrice,
          providerPriceDrift,
        },
      })
      .eq("order_id", order.id);
    if (itemError) throw itemError;

    if (order.status === "paid" || order.status === "pending_payment") {
      await admin.rpc("service_set_order_status", {
        p_order_ref: order.order_code,
        p_status: "accepted",
        p_error: null,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rekonsiliasi NOKOS gagal.";
    const ambiguous = isAmbiguousNokosError(error);
    const manualReviewRequired = ambiguous && nextAttempt >= 3;

    const { error: updateError } = await admin
      .from("supplier_orders")
      .update({
        status: ambiguous ? "processing" : "failed",
        error_message: message,
        request_payload: {
          ...request,
          reconciliationRequired: ambiguous,
        },
        response_payload: {
          ...response,
          error: message,
          reconciliationRequired: ambiguous,
          manualReviewRequired,
          reconcileAttempts: nextAttempt,
          lastReconcileAt: updatedAt,
        },
        updated_at: updatedAt,
      })
      .eq("id", supplier.id);

    if (updateError) {
      console.error("[nokos] gagal menyimpan hasil rekonsiliasi", updateError);
    }

    if (!ambiguous) {
      await refund(
        admin,
        order,
        `${message} Provider memastikan aktivasi gagal. Saldo dikembalikan otomatis.`,
      );
    }
  }
}

async function backfillActivationSnapshot(
  admin: AdminClient,
  supplier: SupplierRow,
  order: OrderRow,
) {
  if (!supplier.supplier_order_id) return;
  const response = supplier.response_payload || {};
  const patch: Record<string, unknown> = {
    ...(supplier.request_payload || {}),
    activationId: supplier.supplier_order_id,
    categoryName: "Nokos",
  };
  const phone = String(response.phone || "").trim();
  const expiresAt = String(response.expires_at || "").trim();
  if (phone) patch.phone = phone;
  if (expiresAt) patch.expiresAt = expiresAt;
  if (response.actual_provider_price !== undefined) patch.actualProviderPrice = response.actual_provider_price;
  if (response.provider_price_drift !== undefined) patch.providerPriceDrift = response.provider_price_drift;
  await mergeOrderInput(admin, order.id, patch);
}

async function syncOne(admin: AdminClient, supplier: SupplierRow, order: OrderRow) {
  if (!supplier.supplier_order_id) {
    await reconcileMissingActivation(admin, supplier, order);
    return;
  }
  await backfillActivationSnapshot(admin, supplier, order);
  const data = await getNokosActivationStatus(supplier.supplier_order_id);
  const status = String(data.status || "").trim().toUpperCase();
  const mergedPayload = { ...(supplier.response_payload || {}), ...data };
  const updatedAt = new Date().toISOString();

  if (status === "STATUS_OK" || status === "RECEIVED") {
    await admin
      .from("supplier_orders")
      .update({ status: "success", response_payload: mergedPayload, updated_at: updatedAt })
      .eq("id", supplier.id);

    const { error: itemError } = await admin
      .from("order_items")
      .update({
        input_data: {
          ...(supplier.request_payload || {}),
          phone: String(mergedPayload.phone || ""),
          activationId: supplier.supplier_order_id,
          otpCode: String(data.code || ""),
          sms: String(data.sms || ""),
          expiresAt: String(mergedPayload.expires_at || ""),
          categoryName: "Nokos",
        },
      })
      .eq("order_id", order.id);
    if (itemError) throw itemError;

    if (!["completed", "refunded", "cancelled", "failed"].includes(order.status)) {
      await admin.rpc("service_set_order_status", {
        p_order_ref: order.order_code,
        p_status: "completed",
        p_error: null,
      });
    }

    void finishNokosActivation(supplier.supplier_order_id).catch(() => undefined);
    return;
  }

  if (["STATUS_CANCEL", "STATUS_CANCELLED", "CANCELLED", "CANCELED", "EXPIRED"].includes(status)) {
    await admin
      .from("supplier_orders")
      .update({ status: "cancelled", response_payload: mergedPayload, updated_at: updatedAt })
      .eq("id", supplier.id);
    await refund(admin, order, "Aktivasi nomor dibatalkan. Saldo dikembalikan otomatis.");
    return;
  }

  await admin
    .from("supplier_orders")
    .update({ status: "processing", response_payload: mergedPayload, updated_at: updatedAt })
    .eq("id", supplier.id);

  if (order.status === "paid" || order.status === "pending_payment") {
    await admin.rpc("service_set_order_status", {
      p_order_ref: order.order_code,
      p_status: "accepted",
      p_error: null,
    });
  }
}

export async function syncNokosOrdersForUser(admin: AdminClient, userId: string) {
  const { data: orders, error: orderError } = await admin
    .from("orders")
    .select("id, order_code, user_id, status, payment_status, payment_method")
    .eq("user_id", userId)
    .eq("supplier", "nokos")
    .in("status", ["paid", "processing", "accepted"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (orderError) throw orderError;
  if (!orders?.length) return;

  const orderMap = new Map((orders as OrderRow[]).map((order) => [order.id, order]));
  const { data: suppliers, error: supplierError } = await admin
    .from("supplier_orders")
    .select("id, order_id, supplier_order_id, status, request_payload, response_payload, updated_at, recovery_locked_until, recovery_attempts")
    .eq("supplier", "nokos")
    .in("status", ["pending", "processing"])
    .in("order_id", Array.from(orderMap.keys()));
  if (supplierError) throw supplierError;

  for (const supplier of (suppliers || []) as SupplierRow[]) {
    const lockedUntil = supplier.recovery_locked_until
      ? new Date(supplier.recovery_locked_until).getTime()
      : 0;
    if (lockedUntil > Date.now()) continue;
    const lastUpdate = supplier.updated_at ? new Date(supplier.updated_at).getTime() : 0;
    if (lastUpdate && Date.now() - lastUpdate < NOKOS_SYNC_INTERVAL_MS) continue;
    const order = orderMap.get(supplier.order_id);
    if (!order) continue;
    try {
      await syncOne(admin, supplier, order);
    } catch (error) {
      console.error(`[nokos] sync ${supplier.supplier_order_id || supplier.id} gagal`, error);
    }
  }
}

async function recoverClaimedNokos(
  admin: AdminClient,
  supplier: SupplierRow,
  order: OrderRow,
) {
  if (supplier.supplier_order_id) {
    await syncOne(admin, supplier, order);
    return;
  }

  const request = supplier.request_payload || {};
  const response = supplier.response_payload || {};
  const attempts = Math.max(0, Math.trunc(Number(response.reconcileAttempts || 0)));
  if (Boolean(response.manualReviewRequired) || attempts >= 3) {
    await markManualReview(
      admin,
      supplier,
      "Provider NOKOS belum memberi hasil final setelah 3 percobaan. Order diamankan untuk pengecekan admin; jangan membuat order ulang.",
    );
    return;
  }

  const service = String(request.service || "").trim();
  const country = Number(request.country);
  const server = request.server === "s1" ? "s1" : request.server === "s2" ? "s2" : null;
  const providerIdempotencyKey = String(
    request.providerIdempotencyKey || response.providerIdempotencyKey || `qevanora-${order.order_code}`,
  ).trim();

  if (!service || !Number.isInteger(country) || country < 0 || !server || !providerIdempotencyKey) {
    await markManualReview(
      admin,
      supplier,
      "Data recovery NOKOS tidak lengkap. Saldo tidak diubah otomatis; order diamankan untuk pengecekan admin.",
    );
    return;
  }

  // Force the existing Tahap-3 reconciler to run for stale crash rows. It uses
  // the SAME provider idempotency key, so retrying cannot legitimately become a
  // second purchase when the provider honors its idempotency contract.
  await reconcileMissingActivation(
    admin,
    {
      ...supplier,
      request_payload: {
        ...request,
        providerIdempotencyKey,
        reconciliationRequired: true,
      },
      response_payload: {
        ...response,
        providerIdempotencyKey,
        reconciliationRequired: true,
      },
    },
    order,
  );
}

export async function syncRecentNokosOrders(admin: AdminClient) {
  const stats = { preparedOrphans: 0, claimed: 0, processed: 0, errors: 0 };

  const { data: prepared, error: prepareError } = await admin.rpc(
    "service_prepare_nokos_orphans_v1",
    { p_limit: 20, p_stale_seconds: 90 },
  );
  if (prepareError) throw prepareError;
  stats.preparedOrphans = Array.isArray(prepared)
    ? prepared.filter((row) => Boolean(row?.created)).length
    : 0;

  const { data: claimed, error: claimError } = await admin.rpc(
    "service_claim_nokos_recovery_v1",
    { p_limit: 10, p_stale_seconds: 90, p_lease_seconds: 90 },
  );
  if (claimError) throw claimError;

  const rows = (claimed || []) as ClaimedRecoveryRow[];
  stats.claimed = rows.length;

  for (const row of rows) {
    const supplier: SupplierRow = {
      id: row.supplier_row_id,
      order_id: row.order_id,
      supplier_order_id: row.supplier_order_id,
      status: row.supplier_status,
      request_payload: row.request_payload || {},
      response_payload: row.response_payload || {},
      updated_at: row.supplier_updated_at,
      recovery_locked_until: row.recovery_locked_until,
      recovery_attempts: row.recovery_attempts,
    };
    const order: OrderRow = {
      id: row.order_id,
      order_code: row.order_code,
      user_id: row.user_id,
      status: row.order_status,
      payment_status: row.payment_status,
      payment_method: row.payment_method,
    };

    let lastError: string | null = null;
    try {
      await recoverClaimedNokos(admin, supplier, order);
      stats.processed += 1;
    } catch (error) {
      stats.errors += 1;
      lastError = errorText(error);
      console.error(`[nokos] recovery ${supplier.supplier_order_id || supplier.id} gagal`, error);
    } finally {
      await releaseRecoveryLease(admin, supplier.id, lastError);
    }
  }

  return stats;
}
