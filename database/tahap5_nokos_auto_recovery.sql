-- TAHAP 5 NOKOS AUTO-RECOVERY
-- AUDIT COPY ONLY. Migration ini SUDAH diterapkan ke Supabase production.
-- Jangan dijalankan manual pada production yang sama.

alter table public.supplier_orders
  add column if not exists recovery_locked_until timestamptz,
  add column if not exists recovery_attempts integer not null default 0,
  add column if not exists recovery_last_at timestamptz,
  add column if not exists recovery_last_error text;

create index if not exists idx_supplier_orders_nokos_recovery
  on public.supplier_orders (supplier, status, recovery_locked_until, updated_at)
  where supplier = 'nokos' and status in ('pending','processing');

-- RPC production yang sudah terpasang:
-- public.service_prepare_nokos_orphans_v1(integer, integer)
-- public.service_claim_nokos_recovery_v1(integer, integer, integer)
-- Keduanya SECURITY DEFINER, di-revoke dari public/anon/authenticated,
-- dan hanya diberikan EXECUTE ke service_role.
