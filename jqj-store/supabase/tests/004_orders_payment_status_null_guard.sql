-- Real Postgres contract for the payment_status NULL guard in
-- 20261110065700_orders_checkout_attempt_and_payment_status.sql.
-- Run by supabase/ci/db-gate.sh (PR #8, unchanged) with ON_ERROR_STOP=1,
-- after every migration has been applied.
--
-- How the migration is exercised mid-test: this file re-runs the REAL
-- migration file with psql's \ir (path relative to this file:
-- ../migrations/...), so the guard under test is byte-for-byte the one that
-- ships, not a copy. db-gate.sh already drives tests through psql -f, so
-- \ir needs no framework change. Around the deliberate failure the file
-- turns ON_ERROR_STOP off, reads psql's LAST_ERROR_SQLSTATE /
-- LAST_ERROR_MESSAGE, turns it back on, and asserts in SQL; any assertion
-- failure raises and stops the gate as usual.
-- If the migration is ever re-timestamped (RUNBOOK route D), update the
-- three \ir lines below.
--
-- Covered:
--   A. Inside a transaction (how the CLI and the connector route run it):
--      NULL payment_status rows (incl. status inventory_exception) make the
--      migration RAISE P0001 'DATA-002 guard: ...'; after ROLLBACK TO
--      SAVEPOINT the rows are unchanged and nothing became 'failed'.
--   B. Autocommit (how db-gate's psql -f runs it, QA note (b)): the guard and
--      SET NOT NULL are one DO statement, so a NULL row aborts the whole
--      block: payment_status stays nullable, the seeded rows are byte-for-byte
--      unchanged, no row is 'failed'. Then the fixture is removed and NOT NULL
--      restored, and the end state is checked.
--   C. Re-applying the migration on the clean, migrated schema is a no-op and
--      succeeds (ON_ERROR_STOP on).
-- Fixture rows use only non-PII columns and a marker total_amount (424242.42)
-- and are deleted again in B; A rolls back.

-- ---------- A. inside a transaction: guard raises, savepoint rollback ----------
begin;

alter table public.orders alter column payment_status drop not null;

insert into public.orders (status, payment_provider, payment_status, total_amount) values
  ('inventory_exception', 'airwallex', null, 424242.42),
  ('paid',                'airwallex', null, 424242.42),
  ('pending',             'cod',       null, 424242.42),
  ('pending',             'airwallex', 'requires_payment_method', 424242.42);

create temp table guard_a_before on commit drop as
  select id, status, payment_status, payment_provider from public.orders where total_amount = 424242.42;

savepoint guard_a;
\set ON_ERROR_STOP 0
\ir ../migrations/20261110065700_orders_checkout_attempt_and_payment_status.sql
\set ON_ERROR_STOP 1
rollback to savepoint guard_a;

select set_config('jqj_test.a_sqlstate', :'LAST_ERROR_SQLSTATE', true),
       set_config('jqj_test.a_message', :'LAST_ERROR_MESSAGE', true) \g /dev/null

do $$
declare
  v_state text := current_setting('jqj_test.a_sqlstate');
  v_msg text := current_setting('jqj_test.a_message');
begin
  if v_state is distinct from 'P0001' or v_msg not like 'DATA-002 guard: 3 orders row(s) have payment_status IS NULL;%' then
    raise exception 'A: expected P0001 "DATA-002 guard: 3 orders row(s) ...", got % "%"', v_state, v_msg;
  end if;
  if (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status') <> 'YES' then
    raise exception 'A: payment_status became NOT NULL despite NULL rows';
  end if;
  if exists (select id, status, payment_status, payment_provider from public.orders where total_amount = 424242.42
             except select * from guard_a_before)
     or (select count(*) from public.orders where total_amount = 424242.42) <> 4 then
    raise exception 'A: seeded rows changed';
  end if;
  if exists (select 1 from public.orders where total_amount = 424242.42 and payment_status = 'failed') then
    raise exception 'A: a row was given payment_status failed';
  end if;
end
$$;

rollback;

-- ---------- B. autocommit: a NULL row aborts the whole guard block ----------
-- Mirrors db-gate's psql -f: each statement of the migration is its own
-- transaction. Precondition: the migrated schema (NOT NULL).
alter table public.orders alter column payment_status drop not null;

insert into public.orders (status, payment_provider, payment_status, total_amount) values
  ('inventory_exception', 'airwallex', null, 424242.42),
  ('paid',                'airwallex', 'succeeded', 424242.42);

create temp table guard_b_before as
  select id, status, payment_status, payment_provider, checkout_attempt_id
  from public.orders where total_amount = 424242.42;

\set ON_ERROR_STOP 0
\ir ../migrations/20261110065700_orders_checkout_attempt_and_payment_status.sql
\set ON_ERROR_STOP 1

select set_config('jqj_test.b_sqlstate', :'LAST_ERROR_SQLSTATE', false),
       set_config('jqj_test.b_message', :'LAST_ERROR_MESSAGE', false) \g /dev/null

do $$
declare
  v_state text := current_setting('jqj_test.b_sqlstate');
  v_msg text := current_setting('jqj_test.b_message');
begin
  if v_state is distinct from 'P0001' or v_msg not like 'DATA-002 guard: 1 orders row(s) have payment_status IS NULL;%' then
    raise exception 'B: expected P0001 "DATA-002 guard: 1 orders row(s) ...", got % "%"', v_state, v_msg;
  end if;
  if (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status') <> 'YES' then
    raise exception 'B: payment_status is NOT NULL after the guard raised (block not atomic)';
  end if;
  if exists (select id, status, payment_status, payment_provider, checkout_attempt_id
               from public.orders where total_amount = 424242.42
             except select * from guard_b_before)
     or (select count(*) from public.orders where total_amount = 424242.42) <> 2 then
    raise exception 'B: seeded rows changed';
  end if;
  if (select payment_status from public.orders
      where total_amount = 424242.42 and status = 'inventory_exception') is not null then
    raise exception 'B: inventory_exception row got a payment_status (backfill must not exist)';
  end if;
end
$$;

-- Clean up B's fixture and restore the migrated schema.
delete from public.orders where total_amount = 424242.42;
drop table guard_b_before;
alter table public.orders alter column payment_status set not null;

-- ---------- C. re-apply on the clean migrated schema is a no-op ----------
create temp table guard_c_before as
  select a.attname::text, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as dflt
  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.orders'::regclass and a.attnum > 0 and not a.attisdropped
  union all
  select 'constraint:' || conname, convalidated, pg_get_constraintdef(oid)
  from pg_constraint where conrelid = 'public.orders'::regclass
  union all
  select 'index:' || indexrelid::regclass::text, indisunique, pg_get_indexdef(indexrelid)
  from pg_index where indrelid = 'public.orders'::regclass;

\ir ../migrations/20261110065700_orders_checkout_attempt_and_payment_status.sql

do $$
begin
  if exists (
      (select a.attname::text, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = 'public.orders'::regclass and a.attnum > 0 and not a.attisdropped
       union all
       select 'constraint:' || conname, convalidated, pg_get_constraintdef(oid)
       from pg_constraint where conrelid = 'public.orders'::regclass
       union all
       select 'index:' || indexrelid::regclass::text, indisunique, pg_get_indexdef(indexrelid)
       from pg_index where indrelid = 'public.orders'::regclass)
      except select * from guard_c_before)
     or (select count(*) from guard_c_before) <> (
       (select count(*) from pg_attribute where attrelid = 'public.orders'::regclass and attnum > 0 and not attisdropped)
       + (select count(*) from pg_constraint where conrelid = 'public.orders'::regclass)
       + (select count(*) from pg_index where indrelid = 'public.orders'::regclass)) then
    raise exception 'C: re-applying the migration changed public.orders';
  end if;
  if (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status') <> 'NO' then
    raise exception 'C: payment_status must be NOT NULL at the end of 004';
  end if;
  if exists (select 1 from public.orders where total_amount = 424242.42) then
    raise exception 'C: fixture rows left behind';
  end if;
end
$$;

drop table guard_c_before;
