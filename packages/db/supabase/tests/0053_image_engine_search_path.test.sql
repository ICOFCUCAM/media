-- Validation for migration 0053 (after stubs, 0026–0052).
\set ON_ERROR_STOP 1
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('image_generations_append_only', 'world_references_append_only')
               and not coalesce(p.proconfig @> array['search_path=public'], false)) then
    raise exception 'search_path not pinned';
  end if;
end $$;
select 'ok 0053';
