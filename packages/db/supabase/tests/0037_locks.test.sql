-- Validation for migration 0037 (after stubs, 0026–0036).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000037a1', '00000000-0000-0000-0000-0000000037aa');
insert into public.scenes (id, project_id, index) values
  ('00000000-0000-0000-0000-00000037c001', '00000000-0000-0000-0000-0000000037a1', 0),
  ('00000000-0000-0000-0000-00000037c002', '00000000-0000-0000-0000-0000000037a1', 1);
insert into public.shots (id, scene_id, status, video_key) values
  ('00000000-0000-0000-0000-00000037d001', '00000000-0000-0000-0000-00000037c001', 'READY', 'clips/1.mp4'),
  ('00000000-0000-0000-0000-00000037d002', '00000000-0000-0000-0000-00000037c002', 'GENERATING', null);
insert into public.dialogue_lines (scene_id, index, text) values ('00000000-0000-0000-0000-00000037c001', 0, 'Where were you?');
insert into public.audio_tracks (scene_id, key) values ('00000000-0000-0000-0000-00000037c001', 'voice.wav');

-- Only a finished scene can be locked.
select pg_temp.expect_error($$update public.scenes set locked_at = now() where id = '00000000-0000-0000-0000-00000037c002'$$, '23514');
update public.scenes set locked_at = now() where id = '00000000-0000-0000-0000-00000037c001';

-- A locked scene's shots, lines, audio and own content are frozen.
select pg_temp.expect_error($$update public.shots set video_key = 'clips/new.mp4' where id = '00000000-0000-0000-0000-00000037d001'$$, '42501');
select pg_temp.expect_error($$insert into public.shots (scene_id, status) values ('00000000-0000-0000-0000-00000037c001', 'PENDING')$$, '42501');
select pg_temp.expect_error($$delete from public.shots where id = '00000000-0000-0000-0000-00000037d001'$$, '42501');
select pg_temp.expect_error($$update public.shots set scene_id = '00000000-0000-0000-0000-00000037c002' where id = '00000000-0000-0000-0000-00000037d001'$$, '42501');
select pg_temp.expect_error($$update public.dialogue_lines set text = 'Out.'$$, '42501');
select pg_temp.expect_error($$insert into public.audio_tracks (scene_id, key) values ('00000000-0000-0000-0000-00000037c001', 'x')$$, '42501');
select pg_temp.expect_error($$update public.scenes set summary = 'rewritten' where id = '00000000-0000-0000-0000-00000037c001'$$, '42501');
select pg_temp.expect_error($$delete from public.scenes where id = '00000000-0000-0000-0000-00000037c001'$$, '42501');
-- Pipeline bookkeeping (status) still moves.
update public.scenes set status = 'READY' where id = '00000000-0000-0000-0000-00000037c001';
-- The other scene is untouched by the lock.
update public.shots set status = 'READY', video_key = 'clips/2.mp4' where id = '00000000-0000-0000-0000-00000037d002';

-- Unlocking frees it again.
update public.scenes set locked_at = null where id = '00000000-0000-0000-0000-00000037c001';
update public.dialogue_lines set text = 'Out.';

-- A film locks only when every shot is ready, and then locks every scene.
update public.shots set status = 'QC_FAIL' where id = '00000000-0000-0000-0000-00000037d002';
select pg_temp.expect_error($$update public.projects set locked_at = now() where id = '00000000-0000-0000-0000-0000000037a1'$$, '23514');
update public.shots set status = 'READY' where id = '00000000-0000-0000-0000-00000037d002';
update public.projects set locked_at = now() where id = '00000000-0000-0000-0000-0000000037a1';
select pg_temp.expect_error($$update public.shots set video_key = 'clips/x.mp4' where id = '00000000-0000-0000-0000-00000037d002'$$, '42501');
select pg_temp.expect_error($$insert into public.scenes (project_id, index) values ('00000000-0000-0000-0000-0000000037a1', 2)$$, '42501');
-- A scene cannot be unlocked out from under a locked film; the project's own other columns still change.
update public.scenes set locked_at = now() where id = '00000000-0000-0000-0000-00000037c002';
select pg_temp.expect_error($$update public.scenes set locked_at = null where id = '00000000-0000-0000-0000-00000037c002'$$, '42501');
update public.projects set title = 'Renamed' where id = '00000000-0000-0000-0000-0000000037a1';
do $$ begin
  assert public.scene_is_locked('00000000-0000-0000-0000-00000037c001'), 'film lock covers every scene';
end $$;

-- Locked by whoever locked it.
update public.projects set locked_at = null where id = '00000000-0000-0000-0000-0000000037a1';
select set_config('test.uid', '00000000-0000-0000-0000-0000000037aa', false);
update public.projects set locked_at = now() where id = '00000000-0000-0000-0000-0000000037a1';
do $$ begin
  assert (select locked_by from public.projects where id = '00000000-0000-0000-0000-0000000037a1') = '00000000-0000-0000-0000-0000000037aa', 'locked_by recorded';
end $$;

-- Deleting the project still cascades through locked scenes.
delete from public.projects where id = '00000000-0000-0000-0000-0000000037a1';
do $$ begin
  assert (select count(*) from public.shots where scene_id in ('00000000-0000-0000-0000-00000037c001', '00000000-0000-0000-0000-00000037c002')) = 0, 'cascade';
end $$;

\echo 0037 locks: ok
