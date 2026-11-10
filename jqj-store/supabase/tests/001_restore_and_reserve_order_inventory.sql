-- Real Postgres contract for the inventory RPCs.
-- A paid order is payment_status = 'succeeded' (DATA-002). The function
-- returns success = false and does not change stock or inventory_reserved.
-- An unpaid reserved order restores stock once and clears the flag.
-- A second restore is a no-op. reserve_order_inventory decrements once
-- and a second reserve does not decrement again.
--
-- Failures raise. The gate runs this with ON_ERROR_STOP=1.
-- Fixtures roll back so later test files see only the migrated schema.

begin;

create function pg_temp.expect_restore(
  label text,
  order_id uuid,
  items jsonb,
  expected_success boolean,
  expected_was_reserved boolean,
  expected_message text,
  product_id uuid,
  expected_stock integer,
  expected_reserved boolean
) returns void
language plpgsql
as $$
declare
  got_success boolean;
  got_was_reserved boolean;
  got_message text;
  got_stock integer;
  got_reserved boolean;
begin
  select success, was_reserved, message
    into strict got_success, got_was_reserved, got_message
  from public.restore_order_inventory(order_id, items);

  if got_success is distinct from expected_success
     or got_was_reserved is distinct from expected_was_reserved
     or got_message is distinct from expected_message then
    raise exception '%: restore_order_inventory returned (%, %, %); expected (%, %, %)',
      label, got_success, got_was_reserved, got_message,
      expected_success, expected_was_reserved, expected_message;
  end if;

  select stock_count into strict got_stock
  from public.products
  where id = product_id;

  select inventory_reserved into strict got_reserved
  from public.orders
  where id = order_id;

  if got_stock is distinct from expected_stock
     or got_reserved is distinct from expected_reserved then
    raise exception '%: stock=% reserved=%; expected stock=% reserved=%',
      label, got_stock, got_reserved, expected_stock, expected_reserved;
  end if;
end;
$$;

create function pg_temp.expect_reserve(
  label text,
  order_id uuid,
  items jsonb,
  expected_success boolean,
  expected_already_reserved boolean,
  expected_message text,
  product_id uuid,
  expected_stock integer,
  expected_reserved boolean
) returns void
language plpgsql
as $$
declare
  got_success boolean;
  got_already_reserved boolean;
  got_message text;
  got_stock integer;
  got_reserved boolean;
begin
  select success, already_reserved, message
    into strict got_success, got_already_reserved, got_message
  from public.reserve_order_inventory(order_id, items);

  if got_success is distinct from expected_success
     or got_already_reserved is distinct from expected_already_reserved
     or got_message is distinct from expected_message then
    raise exception '%: reserve_order_inventory returned (%, %, %); expected (%, %, %)',
      label, got_success, got_already_reserved, got_message,
      expected_success, expected_already_reserved, expected_message;
  end if;

  select stock_count into strict got_stock
  from public.products
  where id = product_id;

  select inventory_reserved into strict got_reserved
  from public.orders
  where id = order_id;

  if got_stock is distinct from expected_stock
     or got_reserved is distinct from expected_reserved then
    raise exception '%: stock=% reserved=%; expected stock=% reserved=%',
      label, got_stock, got_reserved, expected_stock, expected_reserved;
  end if;
end;
$$;

insert into public.products (id, name, slug, price, stock_count, in_stock)
values
  ('00000000-0000-4000-8000-0000000000b1', 'Paid fixture', 'paid-fixture', 40.00, 4, true),
  ('00000000-0000-4000-8000-0000000000b2', 'Open fixture', 'open-fixture', 40.00, 4, true);

insert into public.orders (
  id, status, inventory_reserved, total_amount, payment_status, customer_email
)
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    'paid',
    true,
    40.00,
    'succeeded',
    'paid@example.test'
  ),
  (
    '00000000-0000-4000-8000-0000000000a2',
    'pending',
    false,
    40.00,
    'requires_payment_method',
    'open@example.test'
  );

do $cases$
begin
  -- (a) payment_status succeeded: refuse. Stock stays 4 (still held) and the flag stays set.
  perform pg_temp.expect_restore(
    'paid reserved order',
    '00000000-0000-4000-8000-0000000000a1',
    '[{"product_id":"00000000-0000-4000-8000-0000000000b1","quantity":2}]'::jsonb,
    false,
    true,
    'Order is paid; inventory not restored',
    '00000000-0000-4000-8000-0000000000b1',
    4,
    true
  );

  -- Calling it again must still be a refusal, not a delayed restore.
  perform pg_temp.expect_restore(
    'paid reserved order, second call',
    '00000000-0000-4000-8000-0000000000a1',
    '[{"product_id":"00000000-0000-4000-8000-0000000000b1","quantity":2}]'::jsonb,
    false,
    true,
    'Order is paid; inventory not restored',
    '00000000-0000-4000-8000-0000000000b1',
    4,
    true
  );

  -- reserve_order_inventory: one decrement, then a no-op.
  perform pg_temp.expect_reserve(
    'unpaid order, first reserve',
    '00000000-0000-4000-8000-0000000000a2',
    '[{"product_id":"00000000-0000-4000-8000-0000000000b2","quantity":2}]'::jsonb,
    true,
    false,
    'Inventory reserved',
    '00000000-0000-4000-8000-0000000000b2',
    2,
    true
  );

  perform pg_temp.expect_reserve(
    'unpaid order, second reserve',
    '00000000-0000-4000-8000-0000000000a2',
    '[{"product_id":"00000000-0000-4000-8000-0000000000b2","quantity":2}]'::jsonb,
    true,
    true,
    'Inventory already reserved',
    '00000000-0000-4000-8000-0000000000b2',
    2,
    true
  );

  -- (b) Unpaid and reserved: put the 2 units back and clear the flag.
  perform pg_temp.expect_restore(
    'unpaid reserved order',
    '00000000-0000-4000-8000-0000000000a2',
    '[{"product_id":"00000000-0000-4000-8000-0000000000b2","quantity":2}]'::jsonb,
    true,
    true,
    'Inventory restored',
    '00000000-0000-4000-8000-0000000000b2',
    4,
    false
  );

  -- (c) Already restored: a second call must not add the 2 units again.
  perform pg_temp.expect_restore(
    'already restored order',
    '00000000-0000-4000-8000-0000000000a2',
    '[{"product_id":"00000000-0000-4000-8000-0000000000b2","quantity":2}]'::jsonb,
    true,
    false,
    'Inventory already restored',
    '00000000-0000-4000-8000-0000000000b2',
    4,
    false
  );
end
$cases$;

rollback;
