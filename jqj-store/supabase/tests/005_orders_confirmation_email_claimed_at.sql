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
--   6. BE-016 claim protocol (window: interval '10 minutes', a code constant in
--      BE-016), using BACKEND's exact statements:
--      a. a claim returns the stamp
--      b. a second claim inside the window updates 0 rows
--      c. an expired claim (stamp backdated 11 minutes) is re-claimed and
--         returns a new stamp
--      d. the stale worker's CAS success and CAS clear with the old stamp
--         update 0 rows and leave the new holder's claim intact
--      e. the holder's CAS success sets sent_at and keeps claimed_at
--      f. a claim after sent_at is set updates 0 rows
--      (now() is fixed per transaction; the expiry case backdates the stored
--      stamp instead of waiting.)

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

-- ---------- 6. BE-016 claim protocol ----------
create function pg_temp.be016_claim(p_id uuid) returns timestamptz
language sql
as $$
  update public.orders
  set confirmation_email_claimed_at = now()
  where id = p_id
    and confirmation_email_sent_at is null
    and (confirmation_email_claimed_at is null
         or confirmation_email_claimed_at < now() - interval '10 minutes')
  returning confirmation_email_claimed_at;
$$;

create function pg_temp.be016_success(p_id uuid, p_stamp timestamptz) returns int
language plpgsql
as $$
declare v_n int;
begin
  update public.orders set confirmation_email_sent_at = now()
  where id = p_id and confirmation_email_claimed_at = p_stamp;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

create function pg_temp.be016_fail(p_id uuid, p_stamp timestamptz) returns int
language plpgsql
as $$
declare v_n int;
begin
  update public.orders set confirmation_email_claimed_at = null
  where id = p_id and confirmation_email_claimed_at = p_stamp;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

do $$
declare
  v_id uuid;
  v_old timestamptz;
  v_new timestamptz;
  v_again timestamptz;
  v_claimed timestamptz;
  v_sent timestamptz;
  v_n int;
begin
  insert into public.orders (status, payment_provider, payment_status, total_amount)
  values ('paid', 'airwallex', 'succeeded', 10)
  returning id into v_id;

  -- a. claim returns the stamp
  v_old := pg_temp.be016_claim(v_id);
  if v_old is null or v_old is distinct from now() then
    raise exception '6a: claim returned %, expected now() = %', v_old, now();
  end if;

  -- b. second claim inside the window: 0 rows
  update public.orders
  set confirmation_email_claimed_at = now()
  where id = v_id
    and confirmation_email_sent_at is null
    and (confirmation_email_claimed_at is null
         or confirmation_email_claimed_at < now() - interval '10 minutes');
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception '6b: claim inside the window updated % rows, expected 0', v_n;
  end if;

  -- c. expired claim (backdated 11 minutes) is re-claimed with a new stamp
  update public.orders set confirmation_email_claimed_at = now() - interval '11 minutes'
  where id = v_id;
  v_old := now() - interval '11 minutes';   -- the stale worker's stamp
  v_new := pg_temp.be016_claim(v_id);
  if v_new is null or v_new = v_old then
    raise exception '6c: re-claim after expiry returned %, expected a new stamp (old %)', v_new, v_old;
  end if;

  -- d. stale worker's CAS success and CAS clear with the old stamp: 0 rows each
  if pg_temp.be016_success(v_id, v_old) <> 0 then
    raise exception '6d: stale CAS success updated a row';
  end if;
  if pg_temp.be016_fail(v_id, v_old) <> 0 then
    raise exception '6d: stale CAS clear updated a row';
  end if;
  select confirmation_email_claimed_at, confirmation_email_sent_at into v_claimed, v_sent
  from public.orders where id = v_id;
  if v_claimed is distinct from v_new or v_sent is not null then
    raise exception '6d: after stale CAS claimed_at=% sent_at=%, expected % / NULL', v_claimed, v_sent, v_new;
  end if;

  -- e. holder's CAS success sets sent_at and keeps claimed_at
  if pg_temp.be016_success(v_id, v_new) <> 1 then
    raise exception '6e: holder CAS success did not update exactly 1 row';
  end if;
  select confirmation_email_claimed_at, confirmation_email_sent_at into v_claimed, v_sent
  from public.orders where id = v_id;
  if v_sent is null or v_claimed is distinct from v_new then
    raise exception '6e: after success claimed_at=% sent_at=%, expected % / set', v_claimed, v_sent, v_new;
  end if;

  -- f. claim after sent_at is set: 0 rows, even with an expired claim
  v_again := pg_temp.be016_claim(v_id);
  if v_again is not null then
    raise exception '6f: claim after sent_at returned %', v_again;
  end if;
  update public.orders set confirmation_email_claimed_at = now() - interval '11 minutes' where id = v_id;
  v_again := pg_temp.be016_claim(v_id);
  if v_again is not null then
    raise exception '6f: claim after sent_at (expired claim) returned %', v_again;
  end if;

  -- holder failure path: CAS clear with the current stamp clears it (separate order)
  insert into public.orders (status, payment_provider, payment_status, total_amount)
  values ('paid', 'airwallex', 'succeeded', 10)
  returning id into v_id;
  v_new := pg_temp.be016_claim(v_id);
  v_n := pg_temp.be016_fail(v_id, v_new);
  -- separate statement, so the read below sees the clear (fresh snapshot)
  select confirmation_email_claimed_at into v_claimed from public.orders where id = v_id;
  if v_n <> 1 or v_claimed is not null then
    raise exception '6: holder CAS clear updated % rows, claimed_at now %; expected 1 / NULL', v_n, v_claimed;
  end if;
  if pg_temp.be016_claim(v_id) is null then
    raise exception '6: claim after a cleared failure should succeed';
  end if;
end
$$;

rollback;
