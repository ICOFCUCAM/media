-- Validation for migration 0030 (after stubs, 0026–0029).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Seeded profiles: six, version 1, uncalibrated, µs integers.
do $$ begin
  assert (select count(*) from public.sync_policies) = 6, 'six profiles';
  assert (select bool_and(not calibrated and version = 1) from public.sync_policies), 'v1 uncalibrated';
  assert (select (tolerances ->> 'durationUs')::bigint from public.sync_policies where id = 'broadcast') = 40000, 'broadcast duration';
  assert (select (delivery ->> 'integratedLufs')::numeric from public.sync_policies where id = 'broadcast') = -23, 'broadcast loudness';
end $$;
select pg_temp.expect_error($$update public.sync_policies set calibrated = true where id = 'cinematic'$$, '42501');
select pg_temp.expect_error($$delete from public.sync_policies where id = 'cinematic'$$, '42501');
insert into public.sync_policies (id, version, tolerances, repair, delivery, calibrated)
select id, 2, tolerances || '{"durationUs": 30000}', repair, delivery, true from public.sync_policies where id = 'cinematic';

insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000e');
insert into public.production_timelines (id, project_id, version, fps_num, fps_den, duration_us)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000e1', 1, 24, 1, 10000000);
insert into public.av_sync_reports (id, timeline_version_id, checks, passed, policy)
values ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000e001', '{duration,dialogue_alignment}', false, 'cinematic@1');
select pg_temp.expect_error($$update public.av_sync_reports set passed = true$$, '42501');

insert into public.av_sync_issues (id, report_id, "check", severity, at_us, span_us, measured, expected, confidence, message)
values ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000e002', 'dialogue_alignment', 'error',
        6833333, 1200000, '{"overrunUs":1200000}', '{"overrunUs":0}', 0.95,
        'Shot 17: dialogue exceeds the visual speaking segment by 1.2 seconds');
select pg_temp.expect_error($$insert into public.av_sync_issues (report_id, "check", severity, at_us, confidence, message)
  values ('00000000-0000-0000-0000-00000000e002', 'vibes', 'error', 0, 0.5, 'x')$$, '23514');
select pg_temp.expect_error($$insert into public.av_sync_issues (report_id, "check", severity, at_us, confidence, message)
  values ('00000000-0000-0000-0000-00000000e002', 'drift', 'error', 0, 1.5, 'x')$$, '23514');
select pg_temp.expect_error($$update public.av_sync_issues set message = 'all good'$$, '42501');
select pg_temp.expect_error($$update public.av_sync_issues set status = 'waived'$$, '23514');   -- waiving needs a reason
update public.av_sync_issues set status = 'repairing';

insert into public.repair_jobs (id, issue_id, action)
values ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000e003',
        '{"kind":"regenerate_tail","shotId":"s17","fromUs":3833333,"constraint":"approved_dialogue_timing"}');
select pg_temp.expect_error($$update public.repair_jobs set action = '{"kind":"ignore"}'$$, '42501');
update public.repair_jobs set status = 'succeeded';
do $$ begin
  assert (select finished_at is not null from public.repair_jobs), 'finished_at';
end $$;
select pg_temp.expect_error($$update public.repair_jobs set status = 'running'$$, '42501');
update public.av_sync_issues set status = 'resolved';
select pg_temp.expect_error($$update public.av_sync_issues set status = 'open'$$, '42501');
select pg_temp.expect_error($$delete from public.av_sync_issues$$, '42501');

-- RLS.
grant select on public.sync_policies, public.av_sync_reports, public.av_sync_issues, public.repair_jobs to authenticated;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  assert (select count(*) from public.av_sync_reports) = 1 and (select count(*) from public.av_sync_issues) = 1
     and (select count(*) from public.repair_jobs) = 1, 'owner reads';
end $$;
set test.uid = '00000000-0000-0000-0000-0000000000ff';
do $$ begin
  assert (select count(*) from public.av_sync_reports) + (select count(*) from public.av_sync_issues)
       + (select count(*) from public.repair_jobs) = 0, 'stranger reads nothing';
  assert (select count(*) from public.sync_policies) = 7, 'policies are readable';
end $$;
select pg_temp.expect_error($$insert into public.sync_policies (id, version, tolerances, repair, delivery) values ('x', 1, '{}', '{}', '{}')$$, '42501');
reset role;

-- Cascade from the project.
delete from public.projects where id = '00000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from public.av_sync_reports) + (select count(*) from public.av_sync_issues)
       + (select count(*) from public.repair_jobs) = 0, 'cascade';
end $$;
\echo 0030 OK
