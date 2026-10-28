-- JQD store — remove the retired agentic system from this Supabase project.
--
-- The JQD agentic system (github.com/abmv468/jqd-agentic-system, retired 2026-10-28)
-- shared this database. Its schema created a `products` table with a different shape
-- (sku, category, status, price_usd, margin_pct ...) that replaced the storefront
-- catalog table and broke checkout. This migration drops every agentic table so the
-- store baseline migration can recreate `products` in the storefront shape.
--
-- Run once, before 20261022000000_store_baseline.sql. It is a no-op on a fresh
-- project. A JSON export of these tables was taken before the first run.
-- Do not reuse these table names for store features.

begin;

do $$
begin
  -- Only drop `products` while it still has the agentic shape; never the store catalog.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price_usd'
  ) then
    if exists (select 1 from public.products) then
      raise exception 'The agentic products table still has rows; export them before dropping it.';
    end if;
    drop table public.products cascade;
  end if;
end $$;

drop table if exists public.agent_messages cascade;
drop table if exists public.agent_roles cascade;
drop table if exists public.agent_status cascade;
drop table if exists public.decisions cascade;
drop table if exists public.approvals cascade;
drop table if exists public.alerts cascade;
drop table if exists public.brain_entries cascade;
drop table if exists public.crew_runs cascade;
drop table if exists public.finance_kpis cascade;
drop table if exists public.founder_intents cascade;
drop table if exists public.handoffs cascade;
drop table if exists public.inventory cascade;
drop table if exists public.llm_spend cascade;
drop table if exists public.sync_events cascade;

commit;
