with
t as (select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
f as (select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')
select jsonb_build_object(
 'captured_at', now(),
 'supabase_migrations_schema_exists', exists(select 1 from pg_namespace where nspname='supabase_migrations'),
 'supabase_migrations_objects', (select coalesce(jsonb_agg(c.relname||':'||c.relkind::text order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='supabase_migrations'),
 'count_tables', (select count(*) from t),
 'count_columns', (select count(*) from information_schema.columns where table_schema='public'),
 'count_policies', (select count(*) from pg_policies where schemaname='public'),
 'count_functions', (select count(*) from f),
 'count_triggers', (select count(*) from pg_trigger tg join t on t.oid=tg.tgrelid where not tg.tgisinternal),
 'count_triggers_incl_internal', (select count(*) from pg_trigger tg join t on t.oid=tg.tgrelid),
 'count_indexes', (select count(*) from pg_indexes where schemaname='public'),
 'count_constraints', (select count(*) from pg_constraint co join t on t.oid=co.conrelid),
 'md5_columns', (select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), '|' order by table_name, ordinal_position)) from information_schema.columns where table_schema='public'),
 'md5_function_defs', (select md5(string_agg(pg_get_functiondef(oid), E'\n' order by proname, args)) from f),
 'md5_function_acl', (select md5(string_agg(proname||'('||args||'):'||coalesce((select proacl::text from pg_proc where oid=f.oid),''), '|' order by proname, args)) from f),
 'md5_policies', (select md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||roles::text||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname)) from pg_policies where schemaname='public'),
 'md5_table_grants', (select md5(string_agg(table_name||':'||grantee||':'||privilege_type, '|' order by table_name, grantee, privilege_type)) from information_schema.role_table_grants where table_schema='public'),
 'md5_indexes', (select md5(string_agg(indexname||':'||indexdef, '|' order by indexname)) from pg_indexes where schemaname='public'),
 'md5_constraints', (select md5(string_agg(t.relname||'.'||co.conname||':'||pg_get_constraintdef(co.oid), '|' order by t.relname, co.conname)) from pg_constraint co join t on t.oid=co.conrelid),
 'rls_flags', (select jsonb_object_agg(relname, relrowsecurity::text||'/force='||relforcerowsecurity::text) from t),
 'row_counts', (select jsonb_object_agg(relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', relname), false, true, '')))[1]::text::bigint) from t),
 'rpc_md5', (select jsonb_object_agg(proname||'('||args||')', jsonb_build_object('md5', md5(pg_get_functiondef(oid)), 'secdef', (select prosecdef from pg_proc where oid=f.oid), 'config', (select proconfig from pg_proc where oid=f.oid))) from f)
) as fingerprint;
