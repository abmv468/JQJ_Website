-- ROLLBACK for 20261110080000_orders_confirmation_email_claimed_at.sql (DATA-006)
-- Run ONLY on CTO's say-so (Owner's words for production). One transaction.
--
-- Order of operations matters for checkout:
--   1. Roll back / disable any app code that reads or writes
--      orders.confirmation_email_claimed_at FIRST. Once the column is gone,
--      a PostgREST select/update naming it fails (PGRST204 / 42703); in the
--      payment-success path that would break confirmation handling.
--   2. Then run this file.
-- Guard (CTO decision, no override): refuses with P0001 and changes nothing
-- while ANY row has confirmation_email_claimed_at set. Dropping it would
-- discard the email de-duplication record (a re-run of the sender could
-- email the customer twice). BE-016's success step keeps claimed_at set, so
-- once any confirmation email has been sent this file will always refuse;
-- removing the column after that needs a new reviewed change approved by CTO
-- and the Owner. There is deliberately no session setting or flag to skip
-- the guard.
-- The count runs after LOCK TABLE public.orders IN ACCESS EXCLUSIVE MODE (inside
-- this transaction, after lock_timeout), so the count and the drop are race-free.
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
    -- Lock first (r3, SECOPS/CTO): no claim can be written between the count
    -- and the drop. Waits at most lock_timeout (3s), then fails, nothing changed.
    lock table public.orders in access exclusive mode;
    execute 'select count(*) from public.orders where confirmation_email_claimed_at is not null'
      into v_claimed;
    if v_claimed > 0 then
      raise exception 'DATA-006 rollback guard: % orders row(s) have confirmation_email_claimed_at set; refusing to drop the column', v_claimed
        using errcode = 'P0001',
              hint = 'This rollback has no override. Removing the column while claims exist needs a new reviewed change approved by CTO and the Owner.';
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
