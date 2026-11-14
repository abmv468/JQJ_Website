-- ROLLBACK for 20261110065700_orders_checkout_attempt_and_payment_status.sql
-- Run ONLY on CTO's say-so (Owner's words for production). One transaction.
--
-- Order of operations matters for checkout:
--   1. Roll back / disable any app code that writes orders.checkout_attempt_id
--      FIRST. Once the column is gone, an insert naming it fails (PGRST204 /
--      42703) and that would break card checkout.
--   2. Then run this file.
-- Data loss: dropping the column discards stored attempt ids. Nothing else
-- reads them, so this loses the duplicate-order guard, not order data.
-- payment_status values are untouched; only NOT NULL is lifted. The default
-- stays 'unpaid' (it was 'unpaid' before the migration, so it is restored as is).
-- The migration has no backfill (r2), so there are no backfilled values to
-- undo. If the migration stopped on its NULL guard, nothing from the guard
-- step was applied; running this file is still safe (all IF EXISTS).
-- Idempotent: safe to run twice, and a no-op if the migration never ran.

begin;
select set_config('lock_timeout', '3s', true);

alter table public.orders
  drop constraint if exists orders_checkout_attempt_requires_provider_chk;
alter table public.orders
  drop constraint if exists orders_provider_checkout_attempt_key;
drop index if exists public.orders_provider_checkout_attempt_key;
alter table public.orders
  drop column if exists checkout_attempt_id;

alter table public.orders
  alter column payment_status drop not null;
alter table public.orders
  alter column payment_status set default 'unpaid'::text;

-- Migration-history row, only if it was written (CLI db push, or the
-- connector route's explicit insert). Leaves the 3 baseline rows and any
-- other version alone.
do $hist$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations
    where version = '20261110065700';
  end if;
end
$hist$;

commit;
