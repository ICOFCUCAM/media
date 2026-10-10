-- Validation for migration 0057 (after stubs, 0026–0056).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000057a0');
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000057a1', '00000000-0000-0000-0000-0000000057a0');

-- A multi-department scene revision is an edit request.
insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000057a1', '00000000-0000-0000-0000-0000000057a0',
  '{"kind":"scene_revision","sceneId":"scene_07","revision":{"emotionalArc":{"start":"uneasy","middle":"dread","end":"shaken"},"lighting":"one hard key","music":null}}');
-- Larger than the old 4000-character cap, within the new one.
insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000057a1', '00000000-0000-0000-0000-0000000057a0',
  jsonb_build_object('kind', 'scene_revision', 'sceneId', 'scene_07', 'revision', jsonb_build_object('lighting', repeat('x', 6000))));
-- Unknown kinds and oversized changes are still refused.
select pg_temp.expect_error($$insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000057a1', '00000000-0000-0000-0000-0000000057a0', '{"kind":"rewrite_everything"}')$$, '23514');
select pg_temp.expect_error($$insert into public.edit_requests (project_id, requested_by, change) values ('00000000-0000-0000-0000-0000000057a1', '00000000-0000-0000-0000-0000000057a0', jsonb_build_object('kind', 'scene_revision', 'sceneId', 'scene_07', 'revision', jsonb_build_object('lighting', repeat('x', 13000))))$$, '23514');
select 'ok 0057';
