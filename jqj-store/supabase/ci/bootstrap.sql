-- Roles and auth objects the store migrations grant, revoke, and reference.
-- Stock Postgres has none of these. Supabase creates them before the first
-- migration; this file is the same precondition for the CI database.
-- It is not a migration and must not be copied into supabase/migrations.
--
-- Covered surface, and nothing else:
--   roles anon, authenticated, service_role
--   auth.users(id uuid primary key), which orders and customer tables reference
--   auth.uid(), which the RLS policies call
--
-- A migration that needs another Supabase schema, role, or extension fails
-- here on an empty database. Extend this file when that happens.

do $bootstrap$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end
$bootstrap$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;
