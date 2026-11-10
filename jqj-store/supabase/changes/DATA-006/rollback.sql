-- ROLLBACK for 20261110080000_orders_confirmation_email_claimed_at.sql (DATA-006)
-- Run ONLY on CTO's say-so (Owner's words for production). One transaction.
--
-- Order of operations matters for checkout:
--   1. Roll back / disable any app code that reads or writes
--      orders.confirmation_email_claimed_at FIRST. Once the column is gone,
--      a PostgREST select/update naming it fails (PGRST204 / 42703); in the
--      payment-success path that would break confirmation handling.
--   2. Then run this file.
-- Guard: refuses (and changes nothing) while any row still has a claim
-- timestamp, because dropping it discards the email de-duplication record
-- and a re-run of the sender could email the customer twice. To drop anyway
-- (CTO decision, after step 1), run in the same session first:
--   select set_config('jqd.data006_rollback_force', 'yes', false);
-- Only counts are read; no customer data.
-- Idempotent: a no-op if the column (or the history row) is not there.

begin;
select set_config('lock_timeout', '3s', true);

do $rb$
declare
  v_claimed bigint;
begin
  if exists (select 1 from pg_attribute
             where attrelid = 'public.orders'::regclass
               and attname = 'confirmation_email_claimed_at' and not attisdropped) then
    execute 'select count(*) from public.orders where confirmation_email_claimed_at is not null'
      into v_claimed;
    if v_claimed > 0 and coalesce(current_setting('jqd.data006_rollback_force', true), '') <> 'yes' then
      raise exception 'DATA-006 rollback guard: % orders row(s) have confirmation_email_claimed_at set; refusing to drop the column', v_claimed
        using errcode = 'P0001',
              hint = 'Disable app code using the column first; then set jqd.data006_rollback_force = yes in this session (CTO decision) and re-run.';
    end if;
    alter table public.orders drop column confirmation_email_claimed_at;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations
    where version = '20261110080000';
  end if;
end
$rb$;

commit;
