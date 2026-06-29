-- JQJ Group — Supabase schema & seed
-- Run in the Supabase SQL editor.

-- ============ EXTENSIONS ============
create extension if not exists "uuid-ossp";

-- ============ TABLES ============
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  description text,
  sku text unique,
  price decimal(10,2) not null,
  compare_at_price decimal(10,2),
  category_id uuid references categories(id) on delete set null,
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

alter table products add column if not exists sku text unique;
alter table products add column if not exists low_stock_threshold integer default 5;

create table if not exists product_variants (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  size text,
  material text,
  sku text unique not null,
  stock_count integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  status text default 'pending',
  verification_completed boolean default false,
  verification_claimed_at timestamptz,
  inventory_reserved boolean default false,
  status text default 'paid',
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

create table if not exists order_refunds (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  amount decimal(10,2) not null check (amount > 0),
  reason text,
  created_at timestamptz default now()
);

alter table orders add column if not exists verification_completed boolean default false;
alter table orders add column if not exists verification_claimed_at timestamptz;
alter table orders add column if not exists inventory_reserved boolean default false;

create unique index if not exists orders_stripe_session_id_unique
  on orders (stripe_session_id)
  where stripe_session_id is not null;

create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  product_name text,
  sku text,
  variant_size text,
  variant_material text,
  quantity integer not null,
  price_at_purchase decimal(10,2) not null,
  line_item_meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table order_items add column if not exists variant_id uuid references product_variants(id) on delete set null;
alter table order_items add column if not exists sku text;
alter table order_items add column if not exists variant_size text;
alter table order_items add column if not exists variant_material text;
alter table order_items add column if not exists line_item_meta jsonb default '{}'::jsonb;

alter table orders add column if not exists refunded_amount decimal(10,2) not null default 0;

update orders
set refunded_amount = total_amount
where lower(status) in ('cancelled', 'refunded') and coalesce(refunded_amount, 0) = 0;

update orders
set status = case
  when lower(status) in ('pending', 'processing') then 'paid'
  when lower(status) = 'cancelled' then 'refunded'
  when lower(status) in ('paid', 'packed', 'shipped', 'delivered', 'refunded') then lower(status)
  else 'paid'
end
where status is not null;

alter table orders drop constraint if exists orders_status_check;
alter table orders
  add constraint orders_status_check
  check (status in ('paid', 'packed', 'shipped', 'delivered', 'refunded'));

alter table orders drop constraint if exists orders_refunded_amount_check;
alter table orders
  add constraint orders_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= total_amount);

create index if not exists idx_order_refunds_order_id_created_at on order_refunds(order_id, created_at desc);

create or replace function apply_order_refund(
  p_order_id uuid,
  p_amount decimal(10,2),
  p_reason text default null
) returns void
language plpgsql
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

create table if not exists customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists customer_addresses (
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
  on customer_addresses(user_id)
  where is_default = true;

-- ============ RLS ============
alter table categories enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_refunds enable row level security;
alter table customer_profiles enable row level security;
alter table customer_addresses enable row level security;

drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select using (true);

drop policy if exists "public read products" on products;
create policy "public read products" on products for select using (true);

drop policy if exists "public read product variants" on product_variants;
create policy "public read product variants" on product_variants for select using (true);

drop policy if exists "users read own orders" on orders;
create policy "users read own orders" on orders for select using (auth.uid() = user_id);

drop policy if exists "users insert own orders" on orders;
create policy "users insert own orders" on orders for insert with check (auth.uid() = user_id);

drop policy if exists "users read own order items" on order_items;
create policy "users read own order items" on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
);

drop policy if exists "users read own refunds" on order_refunds;
create policy "users read own refunds" on order_refunds for select using (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
);
drop policy if exists "users read own profiles" on customer_profiles;
create policy "users read own profiles" on customer_profiles for select using (auth.uid() = user_id);

drop policy if exists "users insert own profiles" on customer_profiles;
create policy "users insert own profiles" on customer_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "users update own profiles" on customer_profiles;
create policy "users update own profiles" on customer_profiles for update using (auth.uid() = user_id);

drop policy if exists "users read own addresses" on customer_addresses;
create policy "users read own addresses" on customer_addresses for select using (auth.uid() = user_id);

drop policy if exists "users insert own addresses" on customer_addresses;
create policy "users insert own addresses" on customer_addresses for insert with check (auth.uid() = user_id);

drop policy if exists "users update own addresses" on customer_addresses;
create policy "users update own addresses" on customer_addresses for update using (auth.uid() = user_id);
drop policy if exists "users delete own addresses" on customer_addresses;
create policy "users delete own addresses" on customer_addresses for delete using (auth.uid() = user_id);
create policy "users delete own addresses" on customer_addresses for delete using (auth.uid() = user_id);

-- ============ SEED ============
insert into categories (name, slug) values
  ('Bracelets', 'bracelets'),
  ('Necklaces', 'necklaces')
on conflict (slug) do nothing;

insert into products (name, slug, description, sku, price, compare_at_price, category_id, images, stock_count, low_stock_threshold, rating, review_count, tags, stone, features, specs)
values
  ('Red Leopard Skin Jasper Bracelet III (6mm)', 'red-leopard-skin-jasper-bracelet-iii', 'Earthy and grounding hand-finished bracelet.', 'JQJ-RLSJ-III', 599.99, 699.99, (select id from categories where slug='bracelets'), array['/products/red-leopard-skin-jasper-bracelet-iii-2.jpg','/products/red-leopard-skin-jasper-bracelet-hover.jpg','/products/pearl-silver-necklace-v-2.jpg','/products/JQJ-Group-—-Natural-Stone-Jewelry-with-Cultural-Craft_Photoshoot_Vintage-Sunwashed-Film_2026-06-29_1x.png'], 12, 5, 4.8, 28, array['top-rated','sale'], 'Carnelian', array['Hand-made for your wrist size'], '{"Bead Size":"6mm","Stone":"Red Leopard Skin Jasper"}'),
  ('Raw Brown Tourmaline Bracelet I (8-10mm)', 'raw-brown-tourmaline-bracelet-i', 'Raw untreated brown tourmaline nuggets.', 'JQJ-TOURM-I', 368.99, null, (select id from categories where slug='bracelets'), array['/products/raw-brown-tourmaline-bracelet-i-2.jpg','/products/raw-brown-tourmaline-bracelet-i-3.jpg','/products/brown-tourmaline-bracelet.webp'], 8, 5, 4.7, 19, array['new'], 'Tourmaline', array['Hand-made for your wrist size'], '{"Bead Size":"8-10mm","Stone":"Raw Brown Tourmaline"}'),
  ('Sodalite Bracelet VIII (4mm)', 'sodalite-bracelet-viii', 'Deep blue sodalite with silver accents.', 'JQJ-SOD-VIII', 549.99, null, (select id from categories where slug='bracelets'), array['/products/sodalite-bracelet-viii-1.jpg','/products/sodalite-bracelet.webp'], 15, 5, 4.9, 41, array['top-rated'], 'Sodalite', array['Hand-made for your wrist size'], '{"Bead Size":"4mm","Stone":"Sodalite"}'),
  ('Amethyst Bracelet XV (5mm)', 'amethyst-bracelet-xv', 'Faceted amethyst beads in graduated violet.', 'JQJ-AMETH-XV', 330.99, null, (select id from categories where slug='bracelets'), array['/products/amethyst-bracelet-xv-1.jpg','/products/amethyst-bracelet.webp'], 20, 5, 4.6, 33, array['new','limited'], 'Amethyst', array['Hand-made for your wrist size'], '{"Bead Size":"5mm","Stone":"Amethyst"}'),
  ('Silver Bracelet IV (4mm)', 'silver-bracelet-iv', 'A modern essential with polished beads.', 'JQJ-SIL-IV', 449.99, 499.99, (select id from categories where slug='bracelets'), array['/products/silver-bracelet-iv-2.jpg','/products/silver-bracelet.webp'], 9, 5, 4.8, 26, array['restocked','sale'], 'Tiger Eye', array['Hand-made for your wrist size'], '{"Bead Size":"4mm","Stone":"Hematite Silver"}'),
  ('Labradorite Bracelet V (8mm)', 'labradorite-bracelet-v', 'Iridescent labradorite with blue-gold flash.', 'JQJ-LABR-V', 519.99, null, (select id from categories where slug='bracelets'), array['/products/labradorite-bracelet-v-1.jpg','/products/labradorite-bracelet.webp'], 6, 5, 4.9, 22, array['limited'], 'Lapis Lazuli', array['Hand-made for your wrist size'], '{"Bead Size":"8mm","Stone":"Labradorite"}'),
  ('Blue Lace Agate Silver Pendant', 'blue-lace-agate-silver-pendant', 'Polished blue lace agate point in silver.', 'JQJ-BLAPEN', 249.99, null, (select id from categories where slug='necklaces'), array['/products/blue-lace-agate-silver-pendant-1.jpg','/products/blue-lace-agate-pendant.webp'], 18, 5, 4.7, 14, array['new'], 'Aquamarine', array['Hand-made'], '{"Chain Length":"55cm","Stone":"Blue Lace Agate"}'),
  ('Labradorite Silver Pendant', 'labradorite-silver-pendant', 'Faceted labradorite baton framed in silver.', 'JQJ-LABPEN', 279.99, null, (select id from categories where slug='necklaces'), array['/products/labradorite-silver-pendant-1.jpg','/products/labradorite-pendant.webp'], 11, 5, 4.8, 17, array['restocked'], 'Lapis Lazuli', array['Hand-made'], '{"Chain Length":"55cm","Stone":"Labradorite"}'),
  ('Pearl - Silver Necklace V (7mm)', 'pearl-silver-necklace-v', 'Freshwater pearls with silver-tone hematite.', 'JQJ-PEARL-V', 980.00, null, (select id from categories where slug='necklaces'), array['/products/pearl-silver-necklace-v-1.jpg','/products/pearl-silver-necklace-v-2.jpg','/products/pearl-silver-necklace.webp'], 5, 5, 4.9, 9, array['limited','top-rated'], 'Tiger Eye', array['Hand-made'], '{"Bead Size":"7mm","Stone":"Freshwater Pearl"}')
on conflict (slug) do nothing;

update products
set images = array[
  '/products/red-leopard-skin-jasper-bracelet-iii-2.jpg',
  '/products/red-leopard-skin-jasper-bracelet-hover.jpg',
  '/products/pearl-silver-necklace-v-2.jpg',
  '/products/JQJ-Group-—-Natural-Stone-Jewelry-with-Cultural-Craft_Photoshoot_Vintage-Sunwashed-Film_2026-06-29_1x.png'
]
where slug = 'red-leopard-skin-jasper-bracelet-iii';

insert into product_variants (product_id, size, material, sku, stock_count)
values
  ((select id from products where slug = 'red-leopard-skin-jasper-bracelet-iii'), 'Small', 'Sterling Silver', 'JQJ-RLSJ-III-S-SS', 4),
  ((select id from products where slug = 'red-leopard-skin-jasper-bracelet-iii'), 'Medium', 'Sterling Silver', 'JQJ-RLSJ-III-M-SS', 5),
  ((select id from products where slug = 'red-leopard-skin-jasper-bracelet-iii'), 'Large', 'Sterling Silver', 'JQJ-RLSJ-III-L-SS', 3),
  ((select id from products where slug = 'blue-lace-agate-silver-pendant'), '45cm', 'Sterling Silver', 'JQJ-BLAPEN-45-SS', 7),
  ((select id from products where slug = 'blue-lace-agate-silver-pendant'), '55cm', 'Sterling Silver', 'JQJ-BLAPEN-55-SS', 8),
  ((select id from products where slug = 'blue-lace-agate-silver-pendant'), '55cm', 'Gold Vermeil', 'JQJ-BLAPEN-55-GV', 3)
on conflict (sku) do nothing;

create or replace function reserve_inventory(order_items jsonb)
returns table(success boolean, message text)
language plpgsql
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

create or replace function restore_inventory(order_items jsonb)
returns table(success boolean, message text)
language plpgsql
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

create or replace function reserve_order_inventory(p_order_id uuid, order_items jsonb)
returns table(success boolean, already_reserved boolean, message text)
language plpgsql
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

create or replace function restore_order_inventory(p_order_id uuid, order_items jsonb)
returns table(success boolean, was_reserved boolean, message text)
language plpgsql
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
