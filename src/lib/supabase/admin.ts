import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

export function createAdminClient() {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY belum diatur di Vercel. Buka Supabase > Settings > API Keys dan gunakan Secret key untuk backend."
    );
  }

  return createSupabaseClient(SUPABASE_URL, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
