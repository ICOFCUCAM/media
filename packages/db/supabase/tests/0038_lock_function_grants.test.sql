-- Validation for migration 0038 (after stubs, 0026–0037).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038aa');
insert into public.scenes (id, project_id, index) values ('00000000-0000-0000-0000-00000038c001', '00000000-0000-0000-0000-0000000038a1', 0);
insert into public.shots (scene_id, status, video_key) values ('00000000-0000-0000-0000-00000038c001', 'READY', 'clips/1.mp4');
insert into public.dialogue_lines (scene_id, index, text) values ('00000000-0000-0000-0000-00000038c001', 0, 'Hello.');
update public.scenes set locked_at = now() where id = '00000000-0000-0000-0000-00000038c001';

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000038aa', false);
-- The lock check is not callable over the API…
select pg_temp.expect_error($$select public.scene_is_locked('00000000-0000-0000-0000-00000038c001')$$, '42501');
-- …but the triggers still enforce it for a signed-in writer.
select pg_temp.expect_error($$update public.dialogue_lines set text = 'Bye.'$$, '42501');
reset role;
update public.scenes set locked_at = null where id = '00000000-0000-0000-0000-00000038c001';
set role authenticated;
update public.dialogue_lines set text = 'Bye.';
reset role;

\echo 0038 lock function grants: ok
