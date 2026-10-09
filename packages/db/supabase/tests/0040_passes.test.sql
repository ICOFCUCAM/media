-- Validation for migration 0040 (after stubs, 0026–0039).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

do $$ begin
  assert exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'project_status' and e.enumlabel = 'REVIEW'), 'REVIEW status';
end $$;

insert into public.projects (id, user_id, pass_mode) values
  ('00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040aa', 'three'),
  ('00000000-0000-0000-0000-0000000040b1', '00000000-0000-0000-0000-0000000040aa', 'single');
select pg_temp.expect_error($$update public.projects set story_approved_at = now() where id = '00000000-0000-0000-0000-0000000040a1'$$, '23514'); -- not planned
insert into public.scenes (id, project_id, index) values
  ('00000000-0000-0000-0000-00000040c001', '00000000-0000-0000-0000-0000000040a1', 0),
  ('00000000-0000-0000-0000-00000040c002', '00000000-0000-0000-0000-0000000040a1', 1),
  ('00000000-0000-0000-0000-00000040c101', '00000000-0000-0000-0000-0000000040b1', 0);
insert into public.shots (id, scene_id) values
  ('00000000-0000-0000-0000-00000040d001', '00000000-0000-0000-0000-00000040c001'),
  ('00000000-0000-0000-0000-00000040d002', '00000000-0000-0000-0000-00000040c002'),
  ('00000000-0000-0000-0000-00000040d101', '00000000-0000-0000-0000-00000040c101');

-- The pass mode is fixed once planned.
select pg_temp.expect_error($$update public.projects set pass_mode = 'single' where id = '00000000-0000-0000-0000-0000000040a1'$$, '42501');

-- STORY: no video, no storyboard approval yet; stills (previs) are fine.
select pg_temp.expect_error($$update public.shots set status = 'GENERATING' where id = '00000000-0000-0000-0000-00000040d001'$$, '42501');
select pg_temp.expect_error($$update public.scenes set storyboard_approved_at = now() where id = '00000000-0000-0000-0000-00000040c001'$$, '23514');
update public.shots set seed_image_key = 'projects/x/seeds/1.png' where id = '00000000-0000-0000-0000-00000040d001';
-- A single-pass film is not gated, and has no story to approve.
update public.shots set status = 'GENERATING' where id = '00000000-0000-0000-0000-00000040d101';
select pg_temp.expect_error($$update public.projects set story_approved_at = now() where id = '00000000-0000-0000-0000-0000000040b1'$$, '23514');

-- PREVIS → FINAL per scene.
update public.projects set story_approved_at = now(), previs_started_at = now() where id = '00000000-0000-0000-0000-0000000040a1';
update public.scenes set storyboard_approved_at = now() where id = '00000000-0000-0000-0000-00000040c001';
update public.shots set status = 'GENERATING' where id = '00000000-0000-0000-0000-00000040d001';
select pg_temp.expect_error($$update public.shots set status = 'QUEUED' where id = '00000000-0000-0000-0000-00000040d002'$$, '42501');
select pg_temp.expect_error($$insert into public.shots (scene_id, status) values ('00000000-0000-0000-0000-00000040c002', 'READY')$$, '42501');

-- Withdrawals: not while generating; not the story once a storyboard is approved.
select pg_temp.expect_error($$update public.scenes set storyboard_approved_at = null where id = '00000000-0000-0000-0000-00000040c001'$$, '42501');
select pg_temp.expect_error($$update public.projects set story_approved_at = null where id = '00000000-0000-0000-0000-0000000040a1'$$, '42501');
update public.shots set status = 'READY', video_key = 'clips/1.mp4' where id = '00000000-0000-0000-0000-00000040d001';
update public.scenes set storyboard_approved_at = null where id = '00000000-0000-0000-0000-00000040c001';
update public.projects set story_approved_at = null where id = '00000000-0000-0000-0000-0000000040a1';
do $$ begin
  assert (select previs_started_at from public.projects where id = '00000000-0000-0000-0000-0000000040a1') is null, 'previs restarts after a story change';
end $$;

-- The guards are not callable over the API.
set role authenticated;
select pg_temp.expect_error($$select public.guard_pass_shot()$$, '42501');
reset role;

delete from public.projects where id in ('00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040b1');
\echo 0040 passes: ok
