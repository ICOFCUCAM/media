-- Validation for migration 0039 (after stubs, 0026–0038).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.projects (id, user_id) values
  ('00000000-0000-0000-0000-0000000039a1', '00000000-0000-0000-0000-0000000039aa'),
  ('00000000-0000-0000-0000-0000000039b1', '00000000-0000-0000-0000-0000000039bb');

-- Owners ask for changes to their own films only, as themselves, pending.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000039aa', false);
insert into public.edit_requests (id, project_id, requested_by, change) values
  ('00000000-0000-0000-0000-00000039e001', '00000000-0000-0000-0000-0000000039a1', '00000000-0000-0000-0000-0000000039aa',
   '{"kind":"scene_wardrobe","sceneId":"scene_12","characterId":"char_maya","wardrobe":{"id":"wardrobe_blue","description":"long blue coat"}}');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000039b1', '00000000-0000-0000-0000-0000000039aa', '{"kind":"prop","propId":"prop_x","patch":{}}')$$, '42501');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, requested_by, change, status) values ('00000000-0000-0000-0000-0000000039a1', '00000000-0000-0000-0000-0000000039aa', '{"kind":"prop","propId":"prop_x","patch":{}}', 'applied')$$, '42501');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, change) values ('00000000-0000-0000-0000-0000000039a1', '{"kind":"prop","propId":"prop_x","patch":{}}')$$, '42501');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, change, requested_by) values ('00000000-0000-0000-0000-0000000039a1', '{"kind":"prop","propId":"prop_x","patch":{}}', '00000000-0000-0000-0000-0000000039bb')$$, '42501');
select pg_temp.expect_error($$update public.edit_requests set status = 'applied'$$, '42501');
select pg_temp.expect_error($$delete from public.edit_requests$$, '42501');
do $$ begin
  assert (select requested_by from public.edit_requests where id = '00000000-0000-0000-0000-00000039e001') = '00000000-0000-0000-0000-0000000039aa', 'requester recorded';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000039bb', false);
do $$ begin
  assert (select count(*) from public.edit_requests) = 0, 'others see nothing';
end $$;
reset role;

-- Shape.
select pg_temp.expect_error($$insert into public.edit_requests (project_id, change) values ('00000000-0000-0000-0000-0000000039a1', '{"kind":"delete_everything"}')$$, '23514');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, change) values ('00000000-0000-0000-0000-0000000039a1', '[]')$$, '23514');

-- The worker moves it on; finished is final; the change itself never changes.
update public.edit_requests set status = 'applying' where id = '00000000-0000-0000-0000-00000039e001';
select pg_temp.expect_error($$update public.edit_requests set change = '{"kind":"prop","propId":"p","patch":{}}' where id = '00000000-0000-0000-0000-00000039e001'$$, '42501');
update public.edit_requests set status = 'applied', affected_shots = 2, to_version = 'abc', finished_at = now() where id = '00000000-0000-0000-0000-00000039e001';
select pg_temp.expect_error($$update public.edit_requests set status = 'pending' where id = '00000000-0000-0000-0000-00000039e001'$$, '42501');

-- Project deletion cascades.
delete from public.projects where id = '00000000-0000-0000-0000-0000000039a1';
do $$ begin
  assert (select count(*) from public.edit_requests) = 0, 'cascade';
end $$;

\echo 0039 edit requests: ok
