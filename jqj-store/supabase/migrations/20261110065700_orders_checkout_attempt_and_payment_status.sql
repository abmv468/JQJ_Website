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
--    CHECK orders_checkout_attempt_requires_provider_chk: an attempt id needs
--    a provider, so (NULL provider, attempt) can't slip past the UNIQUE
--    (NULLs distinct). BE-009b writes the column only on Airwallex inserts
--    with payment_provider 'airwallex'; COD leaves it NULL. Safe to add: the
--    column is new, so every existing row has checkout_attempt_id NULL.
-- B) public.orders.payment_status: DEFAULT 'unpaid' (unchanged; every code
--    path sets it explicitly), then SET NOT NULL behind a guard. There is NO
--    backfill: if any row has payment_status IS NULL the migration RAISEs and
--    changes nothing, instead of guessing payment truth from orders.status
--    (r1 mapped inventory_exception -> 'failed', but since PR #9 that status
--    means paid with no stock). Production had 0 NULL rows at 14:55 HKT,
--    10 Nov 2026. No CHECK on the allowed values.
--
-- Atomicity: the NULL guard and SET NOT NULL are ONE DO statement, so they
-- are atomic even when the file runs under autocommit (QA's db-gate runs
-- psql -f without a wrapper). The DO block sets its own transaction-scoped
-- lock_timeout and takes the ACCESS EXCLUSIVE lock before counting, so no
-- NULL row can be written between the check and the ALTER.
-- Transaction: this file has no BEGIN/COMMIT of its own, on purpose. Supabase
-- CLI 3.1.0 (`db push` / `migration up`) runs each file plus its history-row
-- insert as one implicit transaction (one extended-protocol batch with a
-- single Sync). If the file contained BEGIN/COMMIT, the CLI would switch to
-- running the statements as written and insert the history row AFTER the
-- file's COMMIT, outside it (see RUNBOOK.md section 2). The connector route
-- in RUNBOOK.md wraps the file in BEGIN/COMMIT. The index is a plain CREATE
-- UNIQUE INDEX, not CONCURRENTLY: CONCURRENTLY cannot run in a transaction
-- block, and on an 11-row table the plain build holds its lock for
-- milliseconds.
-- lock_timeout (r3): a plain session-level SET at the top, so EVERY statement
-- in this file is covered in every runner, including autocommit psql -f where
-- a transaction-scoped setting would expire after its own statement. A long
-- transaction already holding a lock on orders makes each statement fail fast
-- (3s) instead of queueing (a queued ACCESS EXCLUSIVE request would stall
-- every later read and write on orders, including checkout). It can't leak:
-- Supabase CLI 3.1.0 runs RESET ALL before every migration file
-- (migration-apply.ts resetConnectionState); apply_via_connector.sql RESETs
-- both settings before its COMMIT; psql/db-gate sessions end with the file.
-- The DO blocks also set it transaction-locally (belt and braces).
--
-- Idempotent: every step is IF NOT EXISTS / guarded, so a re-run is a no-op.
-- Rollback: see rollback.sql next to this file (not part of the migration).

set lock_timeout = '3s';
set statement_timeout = '60s';

-- ---------- A) checkout attempt key ----------
alter table public.orders
  add column if not exists checkout_attempt_id uuid;

comment on column public.orders.checkout_attempt_id is
  'Per-cart checkout attempt key (the server-side Airwallex request id). Unique per payment_provider; NULL allowed.';

create unique index if not exists orders_provider_checkout_attempt_key
  on public.orders (payment_provider, checkout_attempt_id);

do $attach$
begin
  perform set_config('lock_timeout', '3s', true);
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

do $check$
begin
  perform set_config('lock_timeout', '3s', true);
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_checkout_attempt_requires_provider_chk'
  ) then
    -- An attempt id without a provider would never conflict on the UNIQUE
    -- above (NULLs distinct), so it is refused outright.
    alter table public.orders
      add constraint orders_checkout_attempt_requires_provider_chk
      check (checkout_attempt_id is null or payment_provider is not null);
  end if;
end
$check$;

-- ---------- B) payment_status ----------
alter table public.orders
  alter column payment_status set default 'unpaid';

-- Guard + SET NOT NULL in ONE statement (atomic under autocommit too).
-- No backfill: NULL rows stop the migration; nothing is derived from
-- orders.status (inventory_exception = paid with no stock since PR #9).
do $not_null$
declare
  v_null_rows bigint;
begin
  perform set_config('lock_timeout', '3s', true);

  if (select a.attnotnull
        from pg_attribute a
       where a.attrelid = 'public.orders'::regclass
         and a.attname = 'payment_status'
         and not a.attisdropped) then
    return; -- already NOT NULL: re-run is a no-op (no lock taken)
  end if;

  -- SET NOT NULL needs ACCESS EXCLUSIVE anyway; taking it first means no
  -- NULL row can appear between the count and the ALTER.
  lock table public.orders in access exclusive mode;

  select count(*) into v_null_rows
  from public.orders
  where payment_status is null;

  if v_null_rows > 0 then
    raise exception
      'DATA-002 guard: % orders row(s) have payment_status IS NULL; refusing to SET NOT NULL', v_null_rows
      using errcode = 'P0001',
            detail = 'No backfill by design: payment truth is not derived from orders.status (inventory_exception means paid with no stock since PR #9). Nothing was changed by this statement.',
            hint = 'Set each NULL payment_status explicitly from payments / Airwallex records (Owner-approved data fix), then re-run this migration.';
  end if;

  alter table public.orders
    alter column payment_status set not null;
end
$not_null$;
