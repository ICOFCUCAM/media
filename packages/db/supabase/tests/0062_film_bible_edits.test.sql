-- Validation for migration 0062 (after stubs, 0026–0061).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000062a0');
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000062a1', '00000000-0000-0000-0000-0000000062a0');

-- A Film Bible change is an edit request; the earlier kinds still are.
insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000062a1', '00000000-0000-0000-0000-0000000062a0',
  '{"kind":"film_bible","patch":{"logline":"A lighthouse keeper hides a stranger.","visualStyle":{"palette":"cold blues"}}}');
insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000062a1', '00000000-0000-0000-0000-0000000062a0',
  '{"kind":"prop","propId":"prop_lamp","patch":{"name":"Oil lamp"}}');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000062a1', '00000000-0000-0000-0000-0000000062a0', '{"kind":"rewrite_everything"}')$$, '23514');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000062a1', '00000000-0000-0000-0000-0000000062a0', jsonb_build_object('kind', 'film_bible', 'patch', jsonb_build_object('synopsis', repeat('x', 13000))))$$, '23514');
select 'ok 0062';
