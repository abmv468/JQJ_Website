-- Real Postgres contract for 20261110065700_orders_checkout_attempt_and_payment_status.
-- Style of QA-002 (PR #8): plain SQL, run by supabase/ci/db-gate.sh with
-- ON_ERROR_STOP=1. Failures raise. Fixtures roll back so later files see only
-- the migrated schema.
--
-- Covered:
--   1. a duplicate (payment_provider, checkout_attempt_id) is rejected (23505,
--      constraint orders_provider_checkout_attempt_key)
--   2. two NULL attempt ids under one provider are allowed
--   3. the same attempt id under a different provider is allowed
--   4. an insert without payment_status gets the default ('unpaid')
--   5. an explicit NULL payment_status is rejected (23502), on INSERT and UPDATE
--   6. schema shape: checkout_attempt_id is a nullable uuid; the unique is a
--      real constraint over exactly (payment_provider, checkout_attempt_id),
--      NULLs distinct; the CHECK orders_checkout_attempt_requires_provider_chk
--      exists, is validated and has the exact expression; payment_status is
--      NOT NULL; RLS on orders still enabled
--   7. NULL-provider gap is CLOSED by the CHECK: (provider NULL, attempt set)
--      fails 23514 naming orders_checkout_attempt_requires_provider_chk, on
--      INSERT and UPDATE; (provider NULL, attempt NULL) is allowed;
--      (airwallex, attempt) is allowed
-- The payment_status NULL guard (no backfill, RAISE) is tested in 004.

begin;

-- ---------- 6. schema shape ----------
do $$
declare
  v_type text;
  v_nullable text;
  v_default text;
  v_cols text[];
  v_nulls_not_distinct boolean;
  v_contype "char";
  v_validated boolean;
  v_checkdef text;
begin
  select data_type, is_nullable into strict v_type, v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'checkout_attempt_id';
  if v_type <> 'uuid' or v_nullable <> 'YES' then
    raise exception 'orders.checkout_attempt_id is % nullable=%; expected uuid nullable=YES', v_type, v_nullable;
  end if;

  select co.contype,
         (select array_agg(a.attname::text order by k.ord)
            from unnest(co.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k.attnum),
         i.indnullsnotdistinct
    into strict v_contype, v_cols, v_nulls_not_distinct
  from pg_constraint co
  join pg_index i on i.indexrelid = co.conindid
  where co.conrelid = 'public.orders'::regclass
    and co.conname = 'orders_provider_checkout_attempt_key';
  if v_contype <> 'u' or v_cols <> array['payment_provider', 'checkout_attempt_id'] then
    raise exception 'orders_provider_checkout_attempt_key is %(%); expected UNIQUE(payment_provider, checkout_attempt_id)', v_contype, v_cols;
  end if;
  if v_nulls_not_distinct then
    raise exception 'orders_provider_checkout_attempt_key must keep NULLs distinct';
  end if;

  select is_nullable, column_default into strict v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status';
  if v_nullable <> 'NO' or v_default is distinct from '''unpaid''::text' then
    raise exception 'orders.payment_status nullable=% default=%; expected NO / ''unpaid''::text', v_nullable, v_default;
  end if;

  select co.contype, co.convalidated, pg_get_constraintdef(co.oid)
    into strict v_contype, v_validated, v_checkdef
  from pg_constraint co
  where co.conrelid = 'public.orders'::regclass
    and co.conname = 'orders_checkout_attempt_requires_provider_chk';
  if v_contype <> 'c' or not v_validated
     or v_checkdef <> 'CHECK (((checkout_attempt_id IS NULL) OR (payment_provider IS NOT NULL)))' then
    raise exception 'orders_checkout_attempt_requires_provider_chk is % validated=% def=%; expected a validated CHECK ((checkout_attempt_id IS NULL) OR (payment_provider IS NOT NULL))',
      v_contype, v_validated, v_checkdef;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.orders'::regclass) then
    raise exception 'RLS must stay enabled on public.orders';
  end if;
end
$$;

-- ---------- fixtures ----------
-- Only non-PII columns; customer_* and shipping_address stay NULL.
create function pg_temp.new_order(
  p_provider text,
  p_attempt uuid,
  p_status text default 'requires_payment_method'
) returns uuid
language sql
as $$
  insert into public.orders (status, payment_provider, payment_status, total_amount, checkout_attempt_id)
  values ('pending', p_provider, p_status, 10, p_attempt)
  returning id;
$$;

-- ---------- 1. duplicate (provider, attempt) is rejected ----------
do $$
declare
  v_constraint text;
begin
  perform pg_temp.new_order('airwallex', 'a0000000-0000-4000-8000-000000000001');
  begin
    perform pg_temp.new_order('airwallex', 'a0000000-0000-4000-8000-000000000001');
    raise exception 'duplicate (airwallex, attempt) was accepted';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'orders_provider_checkout_attempt_key' then
      raise exception 'duplicate rejected by %, expected orders_provider_checkout_attempt_key', v_constraint;
    end if;
  end;

  -- The upsert shape BACKEND can use: ON CONFLICT on the column pair.
  insert into public.orders (status, payment_provider, payment_status, total_amount, checkout_attempt_id)
  values ('pending', 'airwallex', 'requires_payment_method', 10, 'a0000000-0000-4000-8000-000000000001')
  on conflict (payment_provider, checkout_attempt_id) do nothing;
  if (select count(*) from public.orders
      where payment_provider = 'airwallex'
        and checkout_attempt_id = 'a0000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'ON CONFLICT (payment_provider, checkout_attempt_id) DO NOTHING did not keep exactly one row';
  end if;

  -- An UPDATE that would create the duplicate is rejected too.
  perform pg_temp.new_order('airwallex', 'a0000000-0000-4000-8000-000000000002');
  begin
    update public.orders set checkout_attempt_id = 'a0000000-0000-4000-8000-000000000001'
    where checkout_attempt_id = 'a0000000-0000-4000-8000-000000000002';
    raise exception 'UPDATE into a duplicate (airwallex, attempt) was accepted';
  exception when unique_violation then
    null;
  end;
end
$$;

-- ---------- 2. two NULL attempts are allowed ----------
do $$
declare
  v_n int;
begin
  perform pg_temp.new_order('airwallex', null);
  perform pg_temp.new_order('airwallex', null);
  perform pg_temp.new_order('cod', null, 'pending');
  perform pg_temp.new_order('cod', null, 'pending');
  select count(*) into v_n from public.orders where checkout_attempt_id is null;
  if v_n < 4 then
    raise exception 'expected >= 4 rows with NULL checkout_attempt_id, got %', v_n;
  end if;
end
$$;

-- ---------- 3. same attempt under a different provider is allowed ----------
do $$
declare
  v_n int;
begin
  perform pg_temp.new_order('cod', 'a0000000-0000-4000-8000-000000000001', 'pending');
  select count(*) into v_n from public.orders
  where checkout_attempt_id = 'a0000000-0000-4000-8000-000000000001';
  if v_n <> 2 then
    raise exception 'same attempt under airwallex and cod: expected 2 rows, got %', v_n;
  end if;
end
$$;

-- ---------- 4. insert without payment_status gets the default ----------
do $$
declare
  v_id uuid;
  v_status text;
begin
  insert into public.orders (status, payment_provider, total_amount)
  values ('pending', 'airwallex', 10)
  returning id, payment_status into v_id, v_status;
  if v_status is distinct from 'unpaid' then
    raise exception 'insert without payment_status got %, expected unpaid', v_status;
  end if;

  insert into public.orders (status, total_amount, payment_status)
  values ('pending', 10, default)
  returning payment_status into v_status;
  if v_status is distinct from 'unpaid' then
    raise exception 'insert with DEFAULT payment_status got %, expected unpaid', v_status;
  end if;
end
$$;

-- ---------- 5. explicit NULL payment_status is rejected ----------
do $$
declare
  v_column text;
begin
  begin
    insert into public.orders (status, payment_provider, payment_status, total_amount)
    values ('pending', 'airwallex', null, 10);
    raise exception 'INSERT with payment_status NULL was accepted';
  exception when not_null_violation then
    get stacked diagnostics v_column = column_name;
    if v_column is distinct from 'payment_status' then
      raise exception 'not-null violation on %, expected payment_status', v_column;
    end if;
  end;

  begin
    update public.orders set payment_status = null
    where checkout_attempt_id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'UPDATE to payment_status NULL was accepted';
  exception when not_null_violation then
    null;
  end;
end
$$;

-- ---------- 7. NULL-provider gap closed by the CHECK ----------
do $$
declare
  v_constraint text;
  v_id uuid;
  v_n int;
begin
  -- (provider NULL, attempt set) is rejected, naming the CHECK.
  begin
    perform pg_temp.new_order(null, 'a0000000-0000-4000-8000-0000000000ff', 'pending');
    raise exception 'INSERT (provider NULL, attempt set) was accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'orders_checkout_attempt_requires_provider_chk' then
      raise exception 'check violation on %, expected orders_checkout_attempt_requires_provider_chk', v_constraint;
    end if;
  end;

  -- (provider NULL, attempt NULL) is allowed, twice.
  v_id := pg_temp.new_order(null, null, 'pending');
  perform pg_temp.new_order(null, null, 'pending');

  -- An UPDATE that gives a NULL-provider row an attempt id is rejected too.
  begin
    update public.orders set checkout_attempt_id = 'a0000000-0000-4000-8000-0000000000fe'
    where id = v_id;
    raise exception 'UPDATE to (provider NULL, attempt set) was accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'orders_checkout_attempt_requires_provider_chk' then
      raise exception 'UPDATE check violation on %, expected orders_checkout_attempt_requires_provider_chk', v_constraint;
    end if;
  end;

  -- Clearing the provider on a row that has an attempt id is rejected.
  begin
    update public.orders set payment_provider = null
    where payment_provider = 'airwallex'
      and checkout_attempt_id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'UPDATE payment_provider -> NULL on a row with an attempt id was accepted';
  exception when check_violation then
    null;
  end;

  -- (airwallex, attempt) is allowed.
  perform pg_temp.new_order('airwallex', 'a0000000-0000-4000-8000-0000000000ff');

  select count(*) into v_n from public.orders
  where checkout_attempt_id = 'a0000000-0000-4000-8000-0000000000ff';
  if v_n <> 1 then
    raise exception 'attempt ...ff: expected exactly 1 row (airwallex), got %', v_n;
  end if;
  if exists (select 1 from public.orders where checkout_attempt_id is not null and payment_provider is null) then
    raise exception 'a row with an attempt id and NULL provider exists';
  end if;
end
$$;

rollback;
