-- DATA-002: restore_order_inventory must not return stock for a paid order.
--
-- Rollback: replace public.restore_order_inventory(uuid, jsonb) with the previous
-- live body below (pg_get_functiondef md5 457d9c1562b629bf4c8f7629580aa1fb), then
-- re-apply the revoke and grant at the bottom of this file.
-- Previous body, verbatim:
/*
CREATE OR REPLACE FUNCTION public.restore_order_inventory(p_order_id uuid, order_items jsonb)
 RETURNS TABLE(success boolean, was_reserved boolean, message text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
*/

begin;

create or replace function public.restore_order_inventory(p_order_id uuid, order_items jsonb)
returns table(success boolean, was_reserved boolean, message text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  is_reserved boolean;
  order_payment_status text;
begin
  select inventory_reserved, payment_status
  into is_reserved, order_payment_status
  from orders
  where id = p_order_id
  for update;

  if is_reserved is null then
    raise exception 'Order not found while restoring inventory';
  end if;

  -- Same row lock as the reservation flag. A paid order keeps its hold.
  if order_payment_status = 'succeeded' then
    return query select false, is_reserved, 'Order is paid; inventory not restored';
    return;
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

revoke execute on function public.restore_order_inventory(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_order_inventory(uuid, jsonb) to service_role;

commit;
