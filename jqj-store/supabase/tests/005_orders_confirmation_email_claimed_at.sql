-- Real Postgres contract for 20261110080000_orders_confirmation_email_claimed_at.
-- Style of QA-002 (PR #8): plain SQL, run by supabase/ci/db-gate.sh with
-- ON_ERROR_STOP=1. Failures raise. Fixtures roll back.
--
-- Covered:
--   1. orders.confirmation_email_claimed_at is timestamptz, nullable, no default
--   2. an existing-style insert that does not name the column still works and
--      leaves it NULL (the insert shape every current writer uses)
--   3. the value can be set (and read back exactly) and cleared to NULL
--   4. a conditional claim (UPDATE ... WHERE claimed_at IS NULL) wins once
--      and a second claim matches no row
--   5. the sibling confirmation_email_sent_at is unchanged (timestamptz)

begin;

-- ---------- 1. + 5. schema shape ----------
do $$
declare
  v_type text;
  v_nullable text;
  v_default text;
begin
  select data_type, is_nullable, column_default into strict v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_email_claimed_at';
  if v_type <> 'timestamp with time zone' or v_nullable <> 'YES' or v_default is not null then
    raise exception 'orders.confirmation_email_claimed_at is % nullable=% default=%; expected timestamp with time zone / YES / none',
      v_type, v_nullable, v_default;
  end if;

  select data_type into strict v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_email_sent_at';
  if v_type <> 'timestamp with time zone' then
    raise exception 'orders.confirmation_email_sent_at changed type to %', v_type;
  end if;
end
$$;

-- ---------- 2. - 4. behaviour ----------
do $$
declare
  v_id uuid;
  v_claimed timestamptz;
  v_n int;
  v_ts constant timestamptz := '2026-11-10 08:00:00+00';
begin
  -- Existing insert shape (does not name the new column). Only non-PII columns.
  insert into public.orders (status, payment_provider, payment_status, total_amount)
  values ('pending', 'airwallex', 'requires_payment_method', 10)
  returning id, confirmation_email_claimed_at into v_id, v_claimed;
  if v_claimed is not null then
    raise exception 'new order got confirmation_email_claimed_at %, expected NULL', v_claimed;
  end if;

  -- Set and read back.
  update public.orders set confirmation_email_claimed_at = v_ts where id = v_id;
  select confirmation_email_claimed_at into v_claimed from public.orders where id = v_id;
  if v_claimed is distinct from v_ts then
    raise exception 'set: got %, expected %', v_claimed, v_ts;
  end if;

  -- Clear.
  update public.orders set confirmation_email_claimed_at = null where id = v_id;
  select confirmation_email_claimed_at into v_claimed from public.orders where id = v_id;
  if v_claimed is not null then
    raise exception 'clear: got %, expected NULL', v_claimed;
  end if;

  -- Conditional claim wins once.
  update public.orders set confirmation_email_claimed_at = now()
  where id = v_id and confirmation_email_claimed_at is null;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'first claim updated % rows, expected 1', v_n;
  end if;
  update public.orders set confirmation_email_claimed_at = now()
  where id = v_id and confirmation_email_claimed_at is null;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'second claim updated % rows, expected 0', v_n;
  end if;
end
$$;

rollback;
