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
  price decimal(10,2) not null,
  compare_at_price decimal(10,2),
  category_id uuid references categories(id) on delete set null,
  images text[] default '{}',
  in_stock boolean default true,
  stock_count integer default 0,
  rating decimal(2,1) default 0,
  review_count integer default 0,
  tags text[] default '{}',
  stone text,
  features text[] default '{}',
  specs jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
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

create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text,
  quantity integer not null,
  price_at_purchase decimal(10,2) not null,
  created_at timestamptz default now()
);

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

-- ============ RLS ============
alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_refunds enable row level security;

drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select using (true);

drop policy if exists "public read products" on products;
create policy "public read products" on products for select using (true);

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

-- ============ SEED ============
insert into categories (name, slug) values
  ('Bracelets', 'bracelets'),
  ('Necklaces', 'necklaces')
on conflict (slug) do nothing;

insert into products (name, slug, description, price, compare_at_price, category_id, images, stock_count, rating, review_count, tags, stone, features, specs)
values
  ('Red Leopard Skin Jasper Bracelet III (6mm)', 'red-leopard-skin-jasper-bracelet-iii', 'Earthy and grounding hand-finished bracelet.', 599.99, 699.99, (select id from categories where slug='bracelets'), array['/products/red-leopard-jasper-bracelet.webp','/products/lifestyle.webp'], 12, 4.8, 28, array['top-rated','sale'], 'Carnelian', array['Hand-made for your wrist size'], '{"Bead Size":"6mm","Stone":"Red Leopard Skin Jasper"}'),
  ('Raw Brown Tourmaline Bracelet I (8-10mm)', 'raw-brown-tourmaline-bracelet-i', 'Raw untreated brown tourmaline nuggets.', 368.99, null, (select id from categories where slug='bracelets'), array['/products/brown-tourmaline-bracelet.webp'], 8, 4.7, 19, array['new'], 'Tourmaline', array['Hand-made for your wrist size'], '{"Bead Size":"8-10mm","Stone":"Raw Brown Tourmaline"}'),
  ('Sodalite Bracelet VIII (4mm)', 'sodalite-bracelet-viii', 'Deep blue sodalite with silver accents.', 549.99, null, (select id from categories where slug='bracelets'), array['/products/sodalite-bracelet.webp'], 15, 4.9, 41, array['top-rated'], 'Sodalite', array['Hand-made for your wrist size'], '{"Bead Size":"4mm","Stone":"Sodalite"}'),
  ('Amethyst Bracelet XV (5mm)', 'amethyst-bracelet-xv', 'Faceted amethyst beads in graduated violet.', 330.99, null, (select id from categories where slug='bracelets'), array['/products/amethyst-bracelet.webp'], 20, 4.6, 33, array['new','limited'], 'Amethyst', array['Hand-made for your wrist size'], '{"Bead Size":"5mm","Stone":"Amethyst"}'),
  ('Silver Bracelet IV (4mm)', 'silver-bracelet-iv', 'A modern essential with polished beads.', 449.99, 499.99, (select id from categories where slug='bracelets'), array['/products/silver-bracelet.webp'], 9, 4.8, 26, array['restocked','sale'], 'Tiger Eye', array['Hand-made for your wrist size'], '{"Bead Size":"4mm","Stone":"Hematite Silver"}'),
  ('Labradorite Bracelet V (8mm)', 'labradorite-bracelet-v', 'Iridescent labradorite with blue-gold flash.', 519.99, null, (select id from categories where slug='bracelets'), array['/products/labradorite-bracelet.webp'], 6, 4.9, 22, array['limited'], 'Lapis Lazuli', array['Hand-made for your wrist size'], '{"Bead Size":"8mm","Stone":"Labradorite"}'),
  ('Blue Lace Agate Silver Pendant', 'blue-lace-agate-silver-pendant', 'Polished blue lace agate point in silver.', 249.99, null, (select id from categories where slug='necklaces'), array['/products/blue-lace-agate-pendant.webp'], 18, 4.7, 14, array['new'], 'Aquamarine', array['Hand-made'], '{"Chain Length":"55cm","Stone":"Blue Lace Agate"}'),
  ('Labradorite Silver Pendant', 'labradorite-silver-pendant', 'Faceted labradorite baton framed in silver.', 279.99, null, (select id from categories where slug='necklaces'), array['/products/labradorite-pendant.webp'], 11, 4.8, 17, array['restocked'], 'Lapis Lazuli', array['Hand-made'], '{"Chain Length":"55cm","Stone":"Labradorite"}'),
  ('Pearl - Silver Necklace V (7mm)', 'pearl-silver-necklace-v', 'Freshwater pearls with silver-tone hematite.', 980.00, null, (select id from categories where slug='necklaces'), array['/products/pearl-silver-necklace.webp'], 5, 4.9, 9, array['limited','top-rated'], 'Tiger Eye', array['Hand-made'], '{"Bead Size":"7mm","Stone":"Freshwater Pearl"}')
on conflict (slug) do nothing;
