-- Validation for migration 0041 (after stubs, 0026–0040).
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
  ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-0000000041aa'),
  ('00000000-0000-0000-0000-0000000041b1', '00000000-0000-0000-0000-0000000041bb');
insert into public.scenes (id, project_id, index) values ('00000000-0000-0000-0000-00000041c001', '00000000-0000-0000-0000-0000000041a1', 0);
insert into public.shots (id, scene_id) values ('00000000-0000-0000-0000-00000041d001', '00000000-0000-0000-0000-00000041c001');

insert into public.shot_dependencies (project_id, shot_id, entity_type, entity_key) values
  ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-00000041d001', 'character', 'char_maya'),
  ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-00000041d001', 'wardrobe', 'wardrobe_grey_coat');
select pg_temp.expect_error($$insert into public.shot_dependencies (project_id, shot_id, entity_type, entity_key) values ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-00000041d001', 'character', 'char_maya')$$, '23505');
select pg_temp.expect_error($$insert into public.shot_dependencies (project_id, shot_id, entity_type, entity_key) values ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-00000041d001', 'mood', 'x')$$, '23514');

insert into public.scene_versions (project_id, scene_id, scene_index, reason, snapshot) values
  ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-00000041c001', 0, 'replan', '{"heading":"INT. FLAT"}'),
  ('00000000-0000-0000-0000-0000000041b1', gen_random_uuid(), 0, 'canon_edit', '{}');
select pg_temp.expect_error($$insert into public.scene_versions (project_id, scene_id, scene_index, reason, snapshot) values ('00000000-0000-0000-0000-0000000041a1', gen_random_uuid(), 0, 'whim', '{}')$$, '23514');
select pg_temp.expect_error($$update public.scene_versions set reason = 'replan'$$, '42501');
select pg_temp.expect_error($$delete from public.scene_versions$$, '42501');

-- Owners read their own; no client writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000041aa', false);
do $$ begin
  assert (select count(*) from public.shot_dependencies) = 2, 'owner reads dependencies';
  assert (select count(*) from public.scene_versions) = 1, 'owner reads own scene versions only';
end $$;
select pg_temp.expect_error($$insert into public.scene_versions (project_id, scene_id, scene_index, reason, snapshot) values ('00000000-0000-0000-0000-0000000041a1', gen_random_uuid(), 0, 'replan', '{}')$$, '42501');
reset role;

-- A shot's dependencies go with it; scene versions outlive the scene, not the project.
delete from public.scenes where id = '00000000-0000-0000-0000-00000041c001';
do $$ begin
  assert (select count(*) from public.shot_dependencies) = 0, 'dependencies cascade with the shot';
  assert (select count(*) from public.scene_versions where project_id = '00000000-0000-0000-0000-0000000041a1') = 1, 'snapshot survives the scene';
end $$;
delete from public.projects where id in ('00000000-0000-0000-0000-0000000041a1', '00000000-0000-0000-0000-0000000041b1');
do $$ begin
  assert (select count(*) from public.scene_versions) = 0, 'cascade with project';
end $$;

\echo 0041 dependencies and scene versions: ok
