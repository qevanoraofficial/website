import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ ok: false, error: "Silakan masuk ke akun QEVANORA." }, 401);
    }

    const userId = userData.user.id;
    const [walletResult, transactionResult, topupResult] = await Promise.all([
      supabase
        .from("wallets")
        .select("balance, currency, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select(
          "id, transaction_type, direction, amount, balance_before, balance_after, reference_id, metadata, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("topups")
        .select(
          "id, topup_code, status, amount, fee, total_amount, payment_provider, payment_method, external_id, checkout_url, qr_string, expires_at, paid_at, created_at, updated_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (walletResult.error) throw walletResult.error;
    if (transactionResult.error) throw transactionResult.error;
    if (topupResult.error) throw topupResult.error;

    return jsonResponse({
      ok: true,
      balance: Number(walletResult.data?.balance || 0),
      currency: walletResult.data?.currency || "IDR",
      transactions: transactionResult.data || [],
      topups: topupResult.data || [],
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Saldo gagal dibaca.",
      },
      500
    );
  }
}
