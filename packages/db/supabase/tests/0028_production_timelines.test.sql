-- Validation for migration 0028 (run after supabase-stubs.sql and 0028).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Clock math equals packages/shared/src/clock/time.ts (golden values from its tests).
do $$ begin
  assert public.clock_frame_start(1, 24, 1) = 41666, 'frame 1 @24';
  assert public.clock_frame_start(24, 24, 1) = 1000000, 'frame 24 @24';
  assert public.clock_frame_start(1, 24000, 1001) = 41708, 'frame 1 @23.976';
  assert public.clock_frame_start(24000 * 3600, 24000, 1001) = 3603600000000, 'hour @23.976';
  assert public.clock_frame_at(41666, 24, 1) = 1 and public.clock_frame_at(41665, 24, 1) = 0, 'frame_at';
  assert public.clock_is_frame_aligned(83333, 24, 1) and not public.clock_is_frame_aligned(50000, 24, 1), 'aligned';
  -- Round trip over a sample of an hour at 29.97.
  assert (select bool_and(public.clock_frame_at(public.clock_frame_start(n, 30000, 1001), 30000, 1001) = n)
          from generate_series(0, 107892, 997) n), 'round trip @29.97';
end $$;

insert into public.projects (id, user_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
insert into public.production_timelines (id, project_id, version, fps_num, fps_den, duration_us)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 1, 24, 1, 10000000);

-- Picture events must sit on frame boundaries; audio events are free.
insert into public.timeline_events (timeline_version_id, kind, start_us, end_us)
values ('00000000-0000-0000-0000-000000000001', 'shot', 0, 6833333),
       ('00000000-0000-0000-0000-000000000001', 'dialogue', 120000, 2345678);
select pg_temp.expect_error($$insert into public.timeline_events (timeline_version_id, kind, start_us, end_us)
  values ('00000000-0000-0000-0000-000000000001', 'shot', 0, 6840000)$$, '22023');
select pg_temp.expect_error($$insert into public.timeline_events (timeline_version_id, kind, start_us, end_us)
  values ('00000000-0000-0000-0000-000000000001', 'dialogue', 5, 1)$$, '23514');
select pg_temp.expect_error($$insert into public.timeline_events (timeline_version_id, kind, start_us, end_us)
  values ('00000000-0000-0000-0000-000000000001', 'sfx', 0, 10000001)$$, '22023');
select pg_temp.expect_error($$insert into public.timeline_events (timeline_version_id, kind, start_us, end_us, anchor_mode)
  values ('00000000-0000-0000-0000-000000000001', 'sfx', 0, 1, 'start')$$, '23514');
select pg_temp.expect_error($$insert into public.timeline_events (timeline_version_id, kind, start_us, end_us)
  values ('00000000-0000-0000-0000-000000000001', 'explosion', 0, 1)$$, '23514');

-- Approval freezes the clock and the events.
update public.production_timelines set status = 'approved' where id = '00000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select approved_at is not null from public.production_timelines where id = '00000000-0000-0000-0000-000000000001'), 'approved_at';
end $$;
select pg_temp.expect_error($$update public.production_timelines set fps_num = 25 where id = '00000000-0000-0000-0000-000000000001'$$, '42501');
select pg_temp.expect_error($$update public.production_timelines set status = 'draft' where id = '00000000-0000-0000-0000-000000000001'$$, '42501');
select pg_temp.expect_error($$insert into public.timeline_events (timeline_version_id, kind, start_us, end_us)
  values ('00000000-0000-0000-0000-000000000001', 'sfx', 0, 1)$$, '42501');
select pg_temp.expect_error($$update public.timeline_events set start_us = 1 where kind = 'dialogue'$$, '42501');
select pg_temp.expect_error($$delete from public.timeline_events$$, '42501');
select pg_temp.expect_error($$delete from public.production_timelines$$, '42501');
update public.production_timelines set status = 'superseded' where id = '00000000-0000-0000-0000-000000000001';

-- RLS: the owner reads, another user does not, nobody writes through the API.
grant select on public.production_timelines, public.timeline_events to authenticated;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.production_timelines) = 1, 'owner sees timeline';
  assert (select count(*) from public.timeline_events) = 2, 'owner sees events';
end $$;
set test.uid = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.production_timelines) = 0, 'stranger sees nothing';
  assert (select count(*) from public.timeline_events) = 0, 'stranger sees no events';
end $$;
select pg_temp.expect_error($$insert into public.production_timelines (project_id, version, fps_num, fps_den)
  values ('00000000-0000-0000-0000-0000000000b1', 1, 24, 1)$$, '42501');
reset role;

-- Deleting a project still cascades through an approved timeline.
delete from public.projects where id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert (select count(*) from public.production_timelines) = 0 and (select count(*) from public.timeline_events) = 0, 'cascade';
end $$;
\echo 0028 OK
