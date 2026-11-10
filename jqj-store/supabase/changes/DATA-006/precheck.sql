-- PRECHECK for 20261110080000_orders_confirmation_email_claimed_at.sql (DATA-006)
-- READ-ONLY. One SELECT, one JSON row. Counts and catalog metadata only; no
-- PII, no query text, no users, no client addresses. Safe before and after.
--
-- Go/no-go before apply:
--   claimed_at_column = null            (column not there yet)
--   sent_at_column.type = 'timestamp with time zone' (sibling column exists)
--   locks_on_orders_other_sessions = 0, idle_in_txn_sessions = 0,
--   longest_open_xact_s < 5
--   migrations does not already contain 20261110080000
-- After apply: claimed_at_column = {timestamp with time zone, nullable YES,
--   default null}, claimed_at_set = 0, orders_rows unchanged.

select jsonb_build_object(
  'captured_at', now(),
  'orders_rows', (select count(*) from public.orders),
  'sent_at_column', (select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
                     from information_schema.columns
                     where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_email_sent_at'),
  'sent_at_set', (select count(*) from public.orders where confirmation_email_sent_at is not null),
  'claimed_at_column', (select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
                        from information_schema.columns
                        where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_email_claimed_at'),
  'claimed_at_set', case
      when exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'orders' and column_name = 'confirmation_email_claimed_at')
      then (xpath('/row/c/text()', query_to_xml(
              'select count(*) as c from public.orders where confirmation_email_claimed_at is not null',
              false, true, '')))[1]::text::bigint
      else null end,
  'orders_column_count', (select count(*) from information_schema.columns
                          where table_schema = 'public' and table_name = 'orders'),
  'migrations', case when to_regclass('supabase_migrations.schema_migrations') is not null
      then (xpath('/row/v/text()', query_to_xml(
              'select string_agg(version, '','' order by version) as v from supabase_migrations.schema_migrations',
              false, true, '')))[1]::text
      else '<no table>' end,
  'locks_on_orders_other_sessions', (select count(*) from pg_locks l
                                     where l.relation = 'public.orders'::regclass and l.pid <> pg_backend_pid()),
  'idle_in_txn_sessions', (select count(*) from pg_stat_activity
                           where datname = current_database() and pid <> pg_backend_pid()
                             and state like 'idle in transaction%'),
  'longest_open_xact_s', (select coalesce(max(extract(epoch from now() - xact_start))::int, 0)
                          from pg_stat_activity
                          where datname = current_database() and pid <> pg_backend_pid() and xact_start is not null)
) as precheck;
