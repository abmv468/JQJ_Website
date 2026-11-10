-- DATA-006: public.orders.confirmation_email_claimed_at timestamptz (nullable,
-- no default). A claim timestamp the app can set before it sends the order
-- confirmation email (and clear if the send fails), next to the existing
-- confirmation_email_sent_at from 20261023190000_airwallex_payments.sql.
--
-- Separate from DATA-002 (20261110065700); sorts after it and does not
-- depend on it.
-- ADD COLUMN with no default is catalog-only (no table rewrite, no scan), but
-- still takes ACCESS EXCLUSIVE on orders for a moment. lock_timeout 3s makes
-- it fail fast instead of queueing behind a long transaction (a queued
-- ACCESS EXCLUSIVE request would stall checkout reads and writes on orders).
-- The add runs in ONE DO statement that sets its own transaction-scoped
-- lock_timeout, so the limit holds under the Supabase CLI's per-file
-- transaction, the connector's BEGIN/COMMIT wrapper and autocommit psql -f
-- (QA's db-gate) alike. No BEGIN/COMMIT in this file (see DATA-002
-- RUNBOOK section 2 for why that is right for CLI 3.1.0).
-- Idempotent: if the column already exists the block returns without taking
-- any lock. Rollback: rollback.sql next to this file (not part of it).

select set_config('lock_timeout', '3s', true);

do $add_claimed_at$
begin
  perform set_config('lock_timeout', '3s', true);

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.orders'::regclass
      and attname = 'confirmation_email_claimed_at'
      and not attisdropped
  ) then
    return; -- already there: re-run is a no-op
  end if;

  alter table public.orders
    add column if not exists confirmation_email_claimed_at timestamptz;

  comment on column public.orders.confirmation_email_claimed_at is
    'When a sender claimed the order confirmation email (set before sending, cleared if the send fails). NULL = not claimed. See confirmation_email_sent_at.';
end
$add_claimed_at$;
