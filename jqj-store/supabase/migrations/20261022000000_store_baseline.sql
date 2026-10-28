-- JQD store — baseline schema.
--
-- Canonical definition of the storefront tables, constraints, RLS policies and
-- inventory/refund functions (formerly the schema half of data/seed.sql).
-- Idempotent: on a fresh project it creates everything; on an existing project it
-- only adds what is missing and re-attaches foreign keys. Catalog rows live in
-- supabase/seed.sql.
--
-- Ordered before 20261023190000_airwallex_payments.sql, which extends `orders`.

begin;

create extension if not exists "uuid-ossp";

-- ============ CATALOG ============
create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  sku text unique,
  price decimal(10,2) not null,
  compare_at_price decimal(10,2),
  category_id uuid references public.categories(id) on delete set null,
  images text[] default '{}',
  in_stock boolean default true,
  stock_count integer default 0,
  low_stock_threshold integer default 5,
  rating decimal(2,1) default 0,
  review_count integer default 0,
  tags text[] default '{}',
  stone text,
  features text[] default '{}',
  specs jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists public.product_variants (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  material text,
  sku text unique not null,
  stock_count integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists product_variants_product_id_idx
  on public.product_variants(product_id);

-- ============ ORDERS ============
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  status text default 'pending',
  verification_completed boolean default false,
  verification_claimed_at timestamptz,
  inventory_reserved boolean default false,
  total_amount decimal(10,2) not null,
  refunded_amount decimal(10,2) not null default 0,
  shipping_amount decimal(10,2) default 0,
  shipping_address jsonb,
  customer_email text,
  customer_name text,
  stripe_session_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.orders add column if not exists verification_completed boolean default false;
alter table public.orders add column if not exists verification_claimed_at timestamptz;
alter table public.orders add column if not exists inventory_reserved boolean default false;
alter table public.orders add column if not exists refunded_amount decimal(10,2) not null default 0;
alter table public.orders add column if not exists updated_at timestamptz default now();
alter table public.orders alter column status set default 'pending';

-- Checkout routes write pending/processing/failed/failed_fulfillment/inventory_exception
-- before (or instead of) payment; the admin pipeline moves paid orders through
-- packed -> shipped -> delivered, and refunds end in refunded.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in (
    'pending', 'processing', 'paid', 'packed', 'shipped', 'delivered',
    'refunded', 'cancelled', 'failed', 'failed_fulfillment', 'inventory_exception'
  ));

alter table public.orders drop constraint if exists orders_refunded_amount_check;
alter table public.orders
  add constraint orders_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= total_amount);

create unique index if not exists orders_stripe_session_id_unique
  on public.orders (stripe_session_id)
  where stripe_session_id is not null;

create table if not exists public.order_refunds (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount decimal(10,2) not null check (amount > 0),
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_order_refunds_order_id_created_at
  on public.order_refunds(order_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text,
  sku text,
  variant_size text,
  variant_material text,
  quantity integer not null,
  price_at_purchase decimal(10,2) not null,
  line_item_meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.order_items add column if not exists variant_id uuid;
alter table public.order_items add column if not exists sku text;
alter table public.order_items add column if not exists variant_size text;
alter table public.order_items add column if not exists variant_material text;
alter table public.order_items add column if not exists line_item_meta jsonb default '{}'::jsonb;

-- Re-attach catalog foreign keys that were dropped together with an earlier
-- (agentic) products table. Order lines keep product_name/sku/price_at_purchase,
-- so references to products that no longer exist are cleared first.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and contype = 'f'
      and confrelid = 'public.products'::regclass
  ) then
    delete from public.product_variants v
    where not exists (select 1 from public.products p where p.id = v.product_id);

    alter table public.product_variants
      add constraint product_variants_product_id_fkey
      foreign key (product_id) references public.products(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and contype = 'f'
      and confrelid = 'public.products'::regclass
  ) then
    update public.order_items oi
    set product_id = null
    where product_id is not null
      and not exists (select 1 from public.products p where p.id = oi.product_id);

    alter table public.order_items
      add constraint order_items_product_id_fkey
      foreign key (product_id) references public.products(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and contype = 'f'
      and confrelid = 'public.product_variants'::regclass
  ) then
    update public.order_items oi
    set variant_id = null
    where variant_id is not null
      and not exists (select 1 from public.product_variants v where v.id = oi.variant_id);

    alter table public.order_items
      add constraint order_items_variant_id_fkey
      foreign key (variant_id) references public.product_variants(id) on delete set null;
  end if;
end $$;

-- ============ CUSTOMERS ============
create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customer_addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text default 'Shipping',
  first_name text,
  last_name text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  region text,
  postal_code text,
  country text not null,
  phone text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses(user_id)
  where is_default = true;

create table if not exists public.newsletter_subscribers (
  email text primary key,
  source text not null default 'storefront',
  subscribed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ FUNCTIONS ============
create or replace function public.apply_order_refund(
  p_order_id uuid,
  p_amount decimal(10,2),
  p_reason text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_next_refunded decimal(10,2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero';
  end if;

  select *
    into v_order
    from orders
   where id = p_order_id
   for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status = 'refunded' then
    raise exception 'Order is already fully refunded';
  end if;

  v_next_refunded := coalesce(v_order.refunded_amount, 0) + p_amount;
  if v_next_refunded > v_order.total_amount then
    raise exception 'Refund amount exceeds remaining refundable balance';
  end if;

  insert into order_refunds (order_id, amount, reason)
  values (p_order_id, p_amount, nullif(trim(coalesce(p_reason, '')), ''));

  update orders
     set refunded_amount = v_next_refunded,
         status = case when v_next_refunded = total_amount then 'refunded' else status end,
         updated_at = now()
   where id = p_order_id;
end;
$$;

create or replace function public.reserve_inventory(order_items jsonb)
returns table(success boolean, message text)
language plpgsql
set search_path = public
as $$
declare
  row_data record;
  current_stock integer;
  variant_total integer;
begin
  for row_data in
    select
      (entry ->> 'product_id')::uuid as product_id,
      nullif(entry ->> 'variant_id', '')::uuid as variant_id,
      greatest(0, (entry ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(order_items) as entry
  loop
    if row_data.quantity <= 0 then
      continue;
    end if;

    if row_data.variant_id is not null then
      select stock_count into current_stock
      from product_variants
      where id = row_data.variant_id
      for update;

      if current_stock is null or current_stock < row_data.quantity then
        raise exception 'Variant stock unavailable';
      end if;

      update product_variants
      set stock_count = stock_count - row_data.quantity
      where id = row_data.variant_id;

      select coalesce(sum(stock_count), 0) into variant_total
      from product_variants
      where product_id = row_data.product_id;

      update products
      set
        stock_count = variant_total,
        in_stock = variant_total > 0
      where id = row_data.product_id;
    else
      select stock_count into current_stock
      from products
      where id = row_data.product_id
      for update;

      if current_stock is null or current_stock < row_data.quantity then
        raise exception 'Product stock unavailable';
      end if;

      update products
      set
        stock_count = stock_count - row_data.quantity,
        in_stock = (stock_count - row_data.quantity) > 0
      where id = row_data.product_id;
    end if;
  end loop;

  return query select true, 'Stock reserved';
end;
$$;

create or replace function public.restore_inventory(order_items jsonb)
returns table(success boolean, message text)
language plpgsql
set search_path = public
as $$
declare
  row_data record;
  variant_total integer;
begin
  for row_data in
    select
      (entry ->> 'product_id')::uuid as product_id,
      nullif(entry ->> 'variant_id', '')::uuid as variant_id,
      greatest(0, (entry ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(order_items) as entry
  loop
    if row_data.quantity <= 0 then
      continue;
    end if;

    if row_data.variant_id is not null then
      update product_variants
      set stock_count = stock_count + row_data.quantity
      where id = row_data.variant_id;

      if not found then
        raise exception 'Variant not found while restoring inventory';
      end if;

      select coalesce(sum(stock_count), 0) into variant_total
      from product_variants
      where product_id = row_data.product_id;

      update products
      set
        stock_count = variant_total,
        in_stock = variant_total > 0
      where id = row_data.product_id;
    else
      update products
      set
        stock_count = stock_count + row_data.quantity,
        in_stock = true
      where id = row_data.product_id;

      if not found then
        raise exception 'Product not found while restoring inventory';
      end if;
    end if;
  end loop;

  return query select true, 'Stock restored';
end;
$$;

create or replace function public.reserve_order_inventory(p_order_id uuid, order_items jsonb)
returns table(success boolean, already_reserved boolean, message text)
language plpgsql
set search_path = public
as $$
declare
  is_reserved boolean;
begin
  select inventory_reserved into is_reserved
  from orders
  where id = p_order_id
  for update;

  if is_reserved is null then
    raise exception 'Order not found while reserving inventory';
  end if;

  if is_reserved then
    return query select true, true, 'Inventory already reserved';
    return;
  end if;

  perform reserve_inventory(order_items);

  update orders
  set inventory_reserved = true
  where id = p_order_id;

  return query select true, false, 'Inventory reserved';
end;
$$;

create or replace function public.restore_order_inventory(p_order_id uuid, order_items jsonb)
returns table(success boolean, was_reserved boolean, message text)
language plpgsql
set search_path = public
as $$
declare
  is_reserved boolean;
begin
  select inventory_reserved into is_reserved
  from orders
  where id = p_order_id
  for update;

  if is_reserved is null then
    raise exception 'Order not found while restoring inventory';
  end if;

  if not is_reserved then
    return query select true, false, 'Inventory already restored';
    return;
  end if;

  perform restore_inventory(order_items);

  update orders
  set inventory_reserved = false
  where id = p_order_id;

  return query select true, true, 'Inventory restored';
end;
$$;

-- Stock and refund changes only happen in server routes using the service-role key.
revoke execute on function public.apply_order_refund(uuid, decimal, text) from public, anon, authenticated;
revoke execute on function public.reserve_inventory(jsonb) from public, anon, authenticated;
revoke execute on function public.restore_inventory(jsonb) from public, anon, authenticated;
revoke execute on function public.reserve_order_inventory(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.restore_order_inventory(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_order_refund(uuid, decimal, text) to service_role;
grant execute on function public.reserve_inventory(jsonb) to service_role;
grant execute on function public.restore_inventory(jsonb) to service_role;
grant execute on function public.reserve_order_inventory(uuid, jsonb) to service_role;
grant execute on function public.restore_order_inventory(uuid, jsonb) to service_role;

-- ============ RLS ============
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_refunds enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select using (true);

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select using (true);

drop policy if exists "public read product variants" on public.product_variants;
create policy "public read product variants" on public.product_variants for select using (true);

drop policy if exists "users read own orders" on public.orders;
create policy "users read own orders" on public.orders for select using (auth.uid() = user_id);

-- Orders are created only by the checkout routes (service role). A client-side insert
-- policy would let a signed-in user create their own "paid" orders.
drop policy if exists "users insert own orders" on public.orders;

drop policy if exists "users read own order items" on public.order_items;
create policy "users read own order items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

drop policy if exists "users read own refunds" on public.order_refunds;
create policy "users read own refunds" on public.order_refunds for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

drop policy if exists "users read own profiles" on public.customer_profiles;
create policy "users read own profiles" on public.customer_profiles for select using (auth.uid() = user_id);

drop policy if exists "users insert own profiles" on public.customer_profiles;
create policy "users insert own profiles" on public.customer_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "users update own profiles" on public.customer_profiles;
create policy "users update own profiles" on public.customer_profiles for update using (auth.uid() = user_id);

drop policy if exists "users read own addresses" on public.customer_addresses;
create policy "users read own addresses" on public.customer_addresses for select using (auth.uid() = user_id);

drop policy if exists "users insert own addresses" on public.customer_addresses;
create policy "users insert own addresses" on public.customer_addresses for insert with check (auth.uid() = user_id);

drop policy if exists "users update own addresses" on public.customer_addresses;
create policy "users update own addresses" on public.customer_addresses for update using (auth.uid() = user_id);

drop policy if exists "users delete own addresses" on public.customer_addresses;
create policy "users delete own addresses" on public.customer_addresses for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
