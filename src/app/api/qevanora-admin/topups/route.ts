import { NextRequest, NextResponse } from "next/server";
import {
  adminUnauthorizedResponse,
  isAdminRequest,
  isSameOriginRequest,
} from "@/lib/admin-api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("topups")
      .select(
        "id, topup_code, user_id, status, amount, fee, total_amount, payment_provider, payment_method, external_id, expires_at, paid_at, created_at, updated_at, profiles(display_name, phone)"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return response({ ok: true, topups: data || [] });
  } catch (error) {
    return response(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Top up gagal dibaca.",
      },
      500
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  if (!isSameOriginRequest(request)) {
    return response({ ok: false, error: "Origin tidak diizinkan." }, 403);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      topupId?: unknown;
      action?: unknown;
    };
    const topupId = String(body.topupId || "").trim().slice(0, 120);
    const action = String(body.action || "").trim();

    if (!topupId || !["confirm", "cancel"].includes(action)) {
      return response({ ok: false, error: "Top up atau aksi tidak valid." }, 400);
    }

    const admin = createAdminClient();

    if (action === "confirm") {
      const { data, error } = await admin.rpc("service_complete_topup", {
        p_topup_ref: topupId,
        p_external_id: `manual-admin:${topupId}`,
        p_metadata: { confirmed_by: "qevanora_admin" },
      });

      if (error) {
        const message = error.message || "";
        if (message.includes("topup_expired")) {
          await admin
            .from("topups")
            .update({ status: "expired" })
            .eq("id", topupId)
            .eq("status", "pending");
          return response({ ok: false, error: "Permintaan top up sudah kedaluwarsa." }, 409);
        }
        if (message.includes("topup_status_locked")) {
          return response({ ok: false, error: "Status top up sudah final." }, 409);
        }
        throw error;
      }

      return response({ ok: true, result: Array.isArray(data) ? data[0] : data });
    }

    const { data: updated, error: updateError } = await admin
      .from("topups")
      .update({ status: "cancelled" })
      .eq("id", topupId)
      .eq("status", "pending")
      .select("id, topup_code, status")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return response({ ok: false, error: "Top up tidak ditemukan atau sudah final." }, 409);
    }

    return response({ ok: true, result: updated });
  } catch (error) {
    return response(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Top up gagal diperbarui.",
      },
      500
    );
  }
}
