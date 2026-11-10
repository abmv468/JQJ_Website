-- DATA-002 orders hardening: checkout attempt key + payment_status NOT NULL.
--
-- A) public.orders.checkout_attempt_id uuid (nullable) with
--    UNIQUE (payment_provider, checkout_attempt_id). Closes the concurrent
--    double-insert window BE-009 / PR #20 leaves open: two card-checkout
--    requests for the same cart attempt can both insert an order before
--    either payments row exists. The value is the server's effective
--    Airwallex request id for the attempt (a UUID; see RUNBOOK.md, PR #20).
--    NULLs stay distinct (Postgres default; NOT using NULLS NOT DISTINCT), so
--    existing rows and any writer that does not send an attempt id are fine.
-- B) public.orders.payment_status: guarded backfill (no-op when there are no
--    NULLs), DEFAULT 'unpaid' (unchanged; every code path sets it explicitly),
--    SET NOT NULL. No CHECK on the allowed values.
--
-- Transaction: this file has no BEGIN/COMMIT of its own. Supabase CLI 3.1.0
-- runs each migration file in a transaction by default, and the connector
-- route in RUNBOOK.md wraps it in BEGIN/COMMIT. That is why the index is a
-- plain CREATE UNIQUE INDEX, not CONCURRENTLY: CONCURRENTLY cannot run in a
-- transaction block, and on an 11-row table the plain build holds its lock
-- for milliseconds.
-- lock_timeout is transaction-scoped (set_config(..., true)), so a long
-- transaction already holding a lock on orders makes this fail fast and roll
-- back instead of queueing (a queued ACCESS EXCLUSIVE request would stall every
-- later read and write on orders, including checkout).
--
-- Idempotent: every step is IF NOT EXISTS / guarded, so a re-run is a no-op.
-- Rollback: see rollback.sql next to this file (not part of the migration).

select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);

-- ---------- A) checkout attempt key ----------
alter table public.orders
  add column if not exists checkout_attempt_id uuid;

comment on column public.orders.checkout_attempt_id is
  'Per-cart checkout attempt key (the server-side Airwallex request id). Unique per payment_provider; NULL allowed.';

create unique index if not exists orders_provider_checkout_attempt_key
  on public.orders (payment_provider, checkout_attempt_id);

do $attach$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_provider_checkout_attempt_key'
  ) then
    -- Turns the index into a named UNIQUE constraint (same name), so
    -- ON CONFLICT (payment_provider, checkout_attempt_id) and
    -- ON CONFLICT ON CONSTRAINT both work, and 23505 errors name it.
    alter table public.orders
      add constraint orders_provider_checkout_attempt_key
      unique using index orders_provider_checkout_attempt_key;
  end if;
end
$attach$;

-- ---------- B) payment_status ----------
-- Guarded backfill: touches only NULL rows (0 on production at 14:55 HKT,
-- 10 Nov 2026). Same mapping 20261023190000_airwallex_payments.sql used.
update public.orders
set payment_status = case
    when lower(status) in ('paid', 'packed', 'shipped', 'delivered', 'refunded') then 'succeeded'
    when lower(status) in ('failed', 'failed_fulfillment', 'inventory_exception') then 'failed'
    else 'pending'
  end
where payment_status is null;

alter table public.orders
  alter column payment_status set default 'unpaid';

alter table public.orders
  alter column payment_status set not null;
