-- PRECHECK for 20261110065700_orders_checkout_attempt_and_payment_status.sql
-- READ-ONLY. One SELECT, returns one JSON row. No PII: only counts, catalog
-- metadata, and pg_stat_activity/pg_locks counts (no query text, no users,
-- no client addresses). Safe to run before AND after the apply.
--
-- Go/no-go before apply (all must hold):
--   payment_status_null = 0             (the migration has NO backfill: any NULL
--                                        row makes it RAISE and change nothing
--                                        in its guard step; stop and report, do
--                                        not hand-fix without the Owner's words)
--   name_collisions = []                (before apply; both constraint names)
--   checkout_attempt_column = null      (before apply)
--   other_unique_on_same_cols = []
--   locks_on_orders_other_sessions = 0 and idle_in_txn_sessions = 0,
--   longest_open_xact_s small (< 5)
--   migrations = the 3 baseline versions (20261110042024 absent)
-- After apply: checkout_attempt_column.type = uuid, nullable = YES,
--   dup_attempt_groups = 0, attempt_without_provider = 0,
--   attempt_provider_check = {contype c, validated true},
--   payment_status_column.nullable = NO, default 'unpaid'.

select jsonb_build_object(
  'captured_at', now(),
  'orders_rows', (select count(*) from public.orders),
  'payment_status_null', (select count(*) from public.orders where payment_status is null),
  'payment_provider_null', (select count(*) from public.orders where payment_provider is null),
  'payment_status_counts', (select coalesce(jsonb_object_agg(coalesce(s, '<null>'), n), '{}')
                            from (select payment_status s, count(*) n from public.orders group by 1) x),
  'payment_provider_counts', (select coalesce(jsonb_object_agg(coalesce(p, '<null>'), n), '{}')
                              from (select payment_provider p, count(*) n from public.orders group by 1) x),
  'payment_status_column', (select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
                            from information_schema.columns
                            where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status'),
  'payment_provider_column', (select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
                              from information_schema.columns
                              where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_provider'),
  'checkout_attempt_column', (select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
                              from information_schema.columns
                              where table_schema = 'public' and table_name = 'orders' and column_name = 'checkout_attempt_id'),
  -- Duplicate (payment_provider, checkout_attempt_id) groups. Only evaluated
  -- once the column exists (dynamic SQL, so the query never references a
  -- missing column).
  'dup_attempt_groups', case
      when exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'orders' and column_name = 'checkout_attempt_id')
      then (xpath('/row/c/text()', query_to_xml(
              'select count(*) as c from (select 1 from public.orders where checkout_attempt_id is not null group by payment_provider, checkout_attempt_id having count(*) > 1) d',
              false, true, '')))[1]::text::bigint
      else null end,
  -- Same attempt id under a NULL provider is not caught by the UNIQUE (NULLs
  -- are distinct); since r2 the CHECK orders_checkout_attempt_requires_provider_chk
  -- forbids an attempt id without a provider, so after apply both counts below
  -- must be 0.
  'dup_attempt_null_provider', case
      when exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'orders' and column_name = 'checkout_attempt_id')
      then (xpath('/row/c/text()', query_to_xml(
              'select count(*) as c from (select 1 from public.orders where checkout_attempt_id is not null and payment_provider is null group by checkout_attempt_id having count(*) > 1) d',
              false, true, '')))[1]::text::bigint
      else null end,
  'attempt_without_provider', case
      when exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'orders' and column_name = 'checkout_attempt_id')
      then (xpath('/row/c/text()', query_to_xml(
              'select count(*) as c from public.orders where checkout_attempt_id is not null and payment_provider is null',
              false, true, '')))[1]::text::bigint
      else null end,
  'attempt_provider_check', (select jsonb_build_object('contype', contype, 'validated', convalidated,
                                                       'def', pg_get_constraintdef(oid))
                             from pg_constraint
                             where conrelid = 'public.orders'::regclass
                               and conname = 'orders_checkout_attempt_requires_provider_chk'),
  'name_collisions', (select coalesce(jsonb_agg(n.nspname || '.' || c.relname || ':' || c.relkind::text), '[]')
                      from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where c.relname in ('orders_provider_checkout_attempt_key',
                                          'orders_checkout_attempt_requires_provider_chk'))
                     || (select coalesce(jsonb_agg('constraint:' || conrelid::regclass::text || '.' || conname), '[]')
                         from pg_constraint where conname in ('orders_provider_checkout_attempt_key',
                                                              'orders_checkout_attempt_requires_provider_chk')),
  'other_unique_on_same_cols', (select coalesce(jsonb_agg(i.indexrelid::regclass::text), '[]')
                                from pg_index i
                                where i.indrelid = 'public.orders'::regclass and i.indisunique
                                  and i.indexrelid::regclass::text <> 'orders_provider_checkout_attempt_key'
                                  and (select array_agg(a.attname::text order by k.ord)
                                       from unnest(i.indkey) with ordinality k(attnum, ord)
                                       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)
                                      = array['payment_provider', 'checkout_attempt_id']),
  'orders_indexes', (select jsonb_agg(indexname order by indexname) from pg_indexes
                     where schemaname = 'public' and tablename = 'orders'),
  'orders_constraints', (select jsonb_agg(conname order by conname) from pg_constraint
                         where conrelid = 'public.orders'::regclass),
  'migrations', case when to_regclass('supabase_migrations.schema_migrations') is not null
      then (xpath('/row/v/text()', query_to_xml(
              'select string_agg(version, '','' order by version) as v from supabase_migrations.schema_migrations',
              false, true, '')))[1]::text
      else '<no table>' end,
  -- Lock-blocking risk (counts only).
  'locks_on_orders_other_sessions', (select count(*) from pg_locks l
                                     where l.relation = 'public.orders'::regclass and l.pid <> pg_backend_pid()),
  'lock_modes_on_orders', (select coalesce(jsonb_object_agg(mode, n), '{}') from
                           (select l.mode, count(*) n from pg_locks l
                            where l.relation = 'public.orders'::regclass and l.pid <> pg_backend_pid()
                            group by l.mode) x),
  'sessions_by_state', (select coalesce(jsonb_object_agg(coalesce(state, '<null>'), n), '{}') from
                        (select state, count(*) n from pg_stat_activity
                         where datname = current_database() and pid <> pg_backend_pid() group by state) x),
  'idle_in_txn_sessions', (select count(*) from pg_stat_activity
                           where datname = current_database() and pid <> pg_backend_pid()
                             and state like 'idle in transaction%'),
  'longest_open_xact_s', (select coalesce(max(extract(epoch from now() - xact_start))::int, 0)
                          from pg_stat_activity
                          where datname = current_database() and pid <> pg_backend_pid() and xact_start is not null),
  'blocked_sessions', (select count(*) from pg_stat_activity
                       where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0)
) as precheck;
