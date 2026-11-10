-- anon and authenticated must not be able to call the inventory RPCs.
-- has_function_privilege counts a grant to PUBLIC, so a later migration
-- that grants to PUBLIC fails these checks as well.
-- service_role keeps EXECUTE; checkout calls these functions with that role.

do $$
declare
  fn text;
  role_name text;
begin
  foreach fn in array array[
    'public.restore_order_inventory(uuid, jsonb)',
    'public.reserve_order_inventory(uuid, jsonb)'
  ]
  loop
    foreach role_name in array array['public', 'anon', 'authenticated']
    loop
      if has_function_privilege(role_name, fn::regprocedure, 'EXECUTE') then
        raise exception 'role % must not have EXECUTE on %', role_name, fn;
      end if;
    end loop;

    if not has_function_privilege('service_role', fn::regprocedure, 'EXECUTE') then
      raise exception 'service_role must have EXECUTE on %', fn;
    end if;
  end loop;
end
$$;
