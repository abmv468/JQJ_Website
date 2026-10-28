begin;

create extension if not exists "uuid-ossp";

alter table if exists orders
  add column if not exists payment_provider text,
  add column if not exists payment_status text default 'unpaid',
  add column if not exists fulfillment_status text default 'pending_payment',
  add column if not exists payment_reference text,
  add column if not exists sales_channel text default 'website',
  add column if not exists currency text default 'USD',
  add column if not exists subtotal_amount decimal(10,2),
  add column if not exists discount_amount decimal(10,2) not null default 0,
  add column if not exists tax_amount decimal(10,2) not null default 0,
  add column if not exists paid_at timestamptz,
  add column if not exists confirmation_email_sent_at timestamptz;

update orders
set
  payment_provider = coalesce(
    payment_provider,
    nullif(shipping_address->>'payment_method', ''),
    case when stripe_session_id is not null and stripe_session_id like 'COD-%' then 'cod' end,
    case when stripe_session_id is not null then 'stripe' end,
    'unknown'
  ),
  payment_status = coalesce(
    payment_status,
    case
      when lower(status) in ('paid', 'packed', 'shipped', 'delivered', 'refunded') then 'succeeded'
      when lower(status) in ('failed', 'failed_fulfillment', 'inventory_exception') then 'failed'
      else 'pending'
    end
  ),
  fulfillment_status = coalesce(
    fulfillment_status,
    case
      when lower(status) in ('paid', 'packed', 'shipped', 'delivered', 'refunded') then lower(status)
      when lower(status) in ('failed', 'failed_fulfillment', 'inventory_exception') then 'payment_failed'
      else 'pending_payment'
    end
  ),
  subtotal_amount = coalesce(subtotal_amount, greatest(total_amount - coalesce(shipping_amount, 0), 0)),
  sales_channel = coalesce(nullif(sales_channel, ''), 'website'),
  currency = coalesce(nullif(currency, ''), upper(coalesce(shipping_address->>'currency', 'USD'))),
  paid_at = case
    when paid_at is not null then paid_at
    when lower(status) in ('paid', 'packed', 'shipped', 'delivered', 'refunded') then created_at
    else null
  end;

create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_payment_intent_id text not null,
  provider_request_id text,
  amount decimal(10,2) not null check (amount >= 0),
  currency text not null,
  status text not null default 'requires_payment_method',
  paid_at timestamptz,
  last_event_id text,
  last_event_created_at timestamptz,
  client_secret_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_provider_intent_unique
  on payments(provider, provider_payment_intent_id);
create unique index if not exists payments_provider_request_unique
  on payments(provider, provider_request_id)
  where provider_request_id is not null;
create index if not exists payments_order_id_created_at_idx
  on payments(order_id, created_at desc);
create index if not exists payments_provider_status_created_at_idx
  on payments(provider, status, created_at desc);

create table if not exists payment_refunds (
  id uuid primary key default uuid_generate_v4(),
  payment_id uuid not null references payments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_refund_id text not null,
  amount decimal(10,2) not null check (amount > 0),
  currency text not null,
  reason text,
  status text not null default 'pending',
  initiated_by text,
  settled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_refunds_provider_refund_unique
  on payment_refunds(provider, provider_refund_id);
create index if not exists payment_refunds_order_status_created_at_idx
  on payment_refunds(order_id, status, created_at desc);
create index if not exists payment_refunds_payment_id_created_at_idx
  on payment_refunds(payment_id, created_at desc);

create table if not exists payment_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,
  provider_event_id text not null,
  event_name text not null,
  payment_id uuid references payments(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  payload jsonb not null,
  status text not null default 'received',
  processing_error text,
  received_at timestamptz not null default now(),
  event_created_at timestamptz,
  processed_at timestamptz
);

create unique index if not exists payment_webhook_events_provider_event_unique
  on payment_webhook_events(provider, provider_event_id);
create index if not exists payment_webhook_events_status_received_idx
  on payment_webhook_events(status, received_at desc);

create index if not exists orders_payment_lookup_idx
  on orders(payment_provider, payment_status, created_at desc);
create index if not exists orders_fulfillment_lookup_idx
  on orders(fulfillment_status, created_at desc);

alter table if exists payments enable row level security;
alter table if exists payment_refunds enable row level security;
alter table if exists payment_webhook_events enable row level security;

drop policy if exists "users read own payments" on payments;
create policy "users read own payments"
  on payments
  for select
  using (
    exists (
      select 1
      from orders o
      where o.id = payments.order_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "users read own payment refunds" on payment_refunds;
create policy "users read own payment refunds"
  on payment_refunds
  for select
  using (
    exists (
      select 1
      from orders o
      where o.id = payment_refunds.order_id
        and o.user_id = auth.uid()
    )
  );

commit;

