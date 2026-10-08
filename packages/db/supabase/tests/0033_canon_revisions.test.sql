-- Validation for migration 0033 (after stubs, 0026–0032).
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
  ('00000000-0000-0000-0000-0000000033a1', '00000000-0000-0000-0000-0000000033aa'),
  ('00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033bb');

insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome, affected_scenes, affected_shots, invalidated, actor)
values ('00000000-0000-0000-0000-0000000033a1', 'scene_wardrobe',
        '{"kind":"scene_wardrobe","sceneId":"scene_12","characterId":"char_maya"}', repeat('a', 16), repeat('b', 16), 'applied',
        '{scene_11,scene_12}', '[{"sceneId":"scene_11","shotIndex":1},{"sceneId":"scene_12","shotIndex":1}]', 2, 'user:owner');
insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome, issues)
values ('00000000-0000-0000-0000-0000000033b1', 'physical', '{"kind":"physical"}', repeat('c', 16), repeat('d', 16), 'rejected',
        '[{"stage":"canon","code":"PHYSICAL_STATE_DROPPED"}]');

-- Shape checks.
select pg_temp.expect_error($$insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome)
  values ('00000000-0000-0000-0000-0000000033a1', 'x_y', '{}', 'nothex', repeat('b', 16), 'applied')$$, '23514');
select pg_temp.expect_error($$insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome)
  values ('00000000-0000-0000-0000-0000000033a1', 'x_y', '[]', repeat('a', 16), repeat('b', 16), 'applied')$$, '23514');
-- A rejected change must say why and must touch nothing.
select pg_temp.expect_error($$insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome)
  values ('00000000-0000-0000-0000-0000000033a1', 'x_y', '{}', repeat('a', 16), repeat('b', 16), 'rejected')$$, '23514');
select pg_temp.expect_error($$insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome, issues, invalidated)
  values ('00000000-0000-0000-0000-0000000033a1', 'x_y', '{}', repeat('a', 16), repeat('b', 16), 'rejected', '[{"code":"X"}]', 3)$$, '23514');

-- Append-only.
select pg_temp.expect_error($$update public.canon_revisions set actor = 'x'$$, '42501');
select pg_temp.expect_error($$delete from public.canon_revisions$$, '42501');

-- RLS: owners read their own project's revisions only; no client writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000033aa', false);
do $$ begin
  assert (select count(*) from public.canon_revisions) = 1, 'owner sees only own project';
end $$;
select pg_temp.expect_error($$insert into public.canon_revisions (project_id, kind, change, from_version, to_version, outcome)
  values ('00000000-0000-0000-0000-0000000033aa', 'x_y', '{}', repeat('a', 16), repeat('b', 16), 'applied')$$, '42501');
reset role;

-- Project deletion cascades.
delete from public.projects where id = '00000000-0000-0000-0000-0000000033b1';
do $$ begin
  assert (select count(*) from public.canon_revisions where project_id = '00000000-0000-0000-0000-0000000033b1') = 0, 'cascade';
end $$;

\echo 0033 canon revisions: ok
