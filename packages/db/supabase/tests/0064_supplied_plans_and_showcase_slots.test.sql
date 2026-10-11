-- Validation for migration 0064 (after stubs, 0026–0063).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000064b0');

-- A supplied plan is a JSON object with its author; the service role (no auth.uid()) may mark a homepage slot.
insert into public.projects (id, user_id, supplied_plan, supplied_plan_by, showcase_slot)
  values ('00000000-0000-0000-0000-0000000064b1', '00000000-0000-0000-0000-0000000064b0', '{"version":"1"}', 'operator', 'work-1');
select pg_temp.expect_error($$insert into public.projects (user_id, supplied_plan) values ('00000000-0000-0000-0000-0000000064b0', '[1,2]')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, showcase_slot) values ('00000000-0000-0000-0000-0000000064b0', 'banner')$$, '23514');

-- A signed-in user who is not an admin cannot mark a slot, on insert or update.
set test.uid = '00000000-0000-0000-0000-0000000064b0';
select pg_temp.expect_error($$insert into public.projects (user_id, showcase_slot) values ('00000000-0000-0000-0000-0000000064b0', 'hero')$$, '42501');
select pg_temp.expect_error($$update public.projects set showcase_slot = 'work-2' where id = '00000000-0000-0000-0000-0000000064b1'$$, '42501');
-- …but can still edit the rest of a project that already has one.
update public.projects set supplied_plan_by = 'me' where id = '00000000-0000-0000-0000-0000000064b1';
reset test.uid;

-- One featured film per homepage slot.
insert into public.showcase (title, video_path, slot) values ('A', 'showcase/a.mp4', 'hero');
insert into public.showcase (title, video_path) values ('B', 'showcase/b.mp4');
insert into public.showcase (title, video_path) values ('C', 'showcase/c.mp4');
select pg_temp.expect_error($$insert into public.showcase (title, video_path, slot) values ('D', 'showcase/d.mp4', 'hero')$$, '23505');
select pg_temp.expect_error($$insert into public.showcase (title, video_path, slot) values ('E', 'showcase/e.mp4', 'sidebar')$$, '23514');
select 'ok 0064';
