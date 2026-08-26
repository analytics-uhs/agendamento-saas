-- Keep the legacy primary-only payload compatible with the aggregate RPC.
-- PL/pgSQL records must have a known tuple structure even when their branch is
-- represented as null in the curated response.

do $migration$
declare
  function_definition text;
  return_marker constant text := E'  return jsonb_build_object(\n';
  initialization text := E'  if not has_complementary then\n'
    || E'    select null::uuid as id, null::text as label, null::text as intent_name,\n'
    || E'      null::public.booking_group_occupancy_mode as occupancy_mode\n'
    || E'    into selected_group;\n'
    || E'    select null::uuid as id, null::text as name\n'
    || E'    into selected_option;\n'
    || E'  end if;\n\n'
    || E'  perform new_resource_id;\n\n';
begin
  select pg_catalog.pg_get_functiondef(proc.oid)
  into function_definition
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'create_public_reservation'
    and pg_catalog.pg_get_function_identity_arguments(proc.oid) = 'p_slug text, p_payload jsonb';

  if function_definition is null then
    raise exception 'create_public_reservation(text,jsonb) was not found';
  end if;

  if pg_catalog.strpos(function_definition, return_marker) = 0 then
    raise exception 'create_public_reservation return marker was not found';
  end if;

  function_definition := pg_catalog.replace(
    function_definition,
    return_marker,
    initialization || return_marker
  );

  execute function_definition;
end;
$migration$;
