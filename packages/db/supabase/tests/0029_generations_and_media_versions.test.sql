-- Validation for migration 0029 (after stubs, 0026–0028).
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
  assert public.clock_sample_start(48000, 48000) = 1000000 and public.clock_sample_start(1, 48000) = 20, 'samples';
  assert public.clock_is_sample_aligned(50000, 48000) and not public.clock_is_sample_aligned(50011, 48000), 'sample aligned';
end $$;

insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c');
insert into public.shots (id, project_id) values ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000000c1');

-- Media versions are immutable.
insert into public.media_versions (id, project_id, asset_type, asset_id, version, storage_key, sha256, duration_us)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000c1', 'video',
        '00000000-0000-0000-0000-0000000005c1', 1, 'projects/c1/video/g1.mp4', repeat('a', 64), 1562500);
select pg_temp.expect_error($$update public.media_versions set storage_key = 'x'$$, '42501');
select pg_temp.expect_error($$delete from public.media_versions$$, '42501');
select pg_temp.expect_error($$insert into public.media_versions (project_id, asset_type, asset_id, version, storage_key)
  values ('00000000-0000-0000-0000-0000000000c1', 'video', '00000000-0000-0000-0000-0000000005c1', 1, 'dup')$$, '23505');
select pg_temp.expect_error($$insert into public.media_versions (project_id, asset_type, asset_id, version, storage_key, sha256)
  values ('00000000-0000-0000-0000-0000000000c1', 'video', '00000000-0000-0000-0000-0000000005c1', 2, 'k', 'XYZ')$$, '23514');

-- A video generation: request fixed at insert, result + classification written once.
insert into public.video_generations (id, project_id, shot_id, model_id, requested_duration_us, requested_fps_num)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000005c1', 'wan-2.1', 5000000, 16);
select pg_temp.expect_error($$update public.video_generations set outcome = 'ACCEPTED'$$, '23514');  -- outcome needs code + policy
update public.video_generations
   set timing_report = '{"actualDurationUs":1562500}', actual_duration_us = 1562500,
       outcome = 'REQUIRES_REGENERATION', outcome_code = 'DURATION_OUT_OF_TOLERANCE', policy = 'cinematic@1',
       media_version_id = '00000000-0000-0000-0000-00000000a001'
 where id = '00000000-0000-0000-0000-00000000b001';
do $$ begin
  assert (select classified_at is not null from public.video_generations), 'classified_at stamped';
end $$;
select pg_temp.expect_error($$update public.video_generations set outcome = 'ACCEPTED'$$, '42501');
select pg_temp.expect_error($$update public.video_generations set requested_duration_us = 1562500$$, '42501');
select pg_temp.expect_error($$update public.video_generations set model_id = 'hunyuan'$$, '42501');
select pg_temp.expect_error($$delete from public.video_generations$$, '42501');
select pg_temp.expect_error($$insert into public.video_generations (project_id, model_id, requested_duration_us, requested_fps_num, outcome, outcome_code, policy)
  values ('00000000-0000-0000-0000-0000000000c1', 'wan-2.1', 1, 16, 'SUCCESS', 'x', 'p')$$, '23514');
-- Deleting the shot keeps the ledger (shot_id → null).
delete from public.shots where id = '00000000-0000-0000-0000-0000000005c1';
do $$ begin
  assert (select shot_id is null and outcome = 'REQUIRES_REGENERATION' from public.video_generations), 'ledger survives shot deletion';
end $$;

-- Audio: ledger + sample-accurate placements on a draft timeline only.
insert into public.audio_generations (id, project_id, kind, provider, requested_start_us, requested_end_us)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'dialogue', 'openai', 0, 2000000);
insert into public.production_timelines (id, project_id, version, fps_num, fps_den, duration_us)
values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000c1', 1, 24, 1, 10000000);
insert into public.audio_events (timeline_version_id, audio_generation_id, stem, start_us, end_us, fade_in_us)
values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001', 'dialogue', 120000, 2120000, 10000);
select pg_temp.expect_error($$insert into public.audio_events (timeline_version_id, stem, start_us, end_us)
  values ('00000000-0000-0000-0000-00000000d001', 'sfx', 50011, 60000)$$, '22023');
select pg_temp.expect_error($$insert into public.audio_events (timeline_version_id, stem, start_us, end_us, fade_in_us, fade_out_us)
  values ('00000000-0000-0000-0000-00000000d001', 'sfx', 0, 100000, 60000, 60000)$$, '23514');
select pg_temp.expect_error($$insert into public.audio_events (timeline_version_id, stem, start_us, end_us)
  values ('00000000-0000-0000-0000-00000000d001', 'music', 0, 20000000)$$, '22023');
update public.production_timelines set status = 'approved' where id = '00000000-0000-0000-0000-00000000d001';
select pg_temp.expect_error($$update public.audio_events set gain_db = -3$$, '42501');
select pg_temp.expect_error($$insert into public.audio_events (timeline_version_id, stem, start_us, end_us)
  values ('00000000-0000-0000-0000-00000000d001', 'sfx', 0, 20)$$, '42501');

-- RLS: owner reads all four; a stranger reads none; no API writes.
grant select on public.media_versions, public.video_generations, public.audio_generations, public.audio_events to authenticated;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.media_versions) = 1 and (select count(*) from public.video_generations) = 1
     and (select count(*) from public.audio_generations) = 1 and (select count(*) from public.audio_events) = 1, 'owner reads';
end $$;
set test.uid = '00000000-0000-0000-0000-0000000000ff';
do $$ begin
  assert (select count(*) from public.media_versions) + (select count(*) from public.video_generations)
       + (select count(*) from public.audio_generations) + (select count(*) from public.audio_events) = 0, 'stranger reads nothing';
end $$;
select pg_temp.expect_error($$insert into public.video_generations (project_id, model_id, requested_duration_us, requested_fps_num)
  values ('00000000-0000-0000-0000-0000000000c1', 'wan-2.1', 1, 16)$$, '42501');
reset role;

-- Project deletion cascades through every immutable ledger.
delete from public.projects where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert (select count(*) from public.media_versions) + (select count(*) from public.video_generations)
       + (select count(*) from public.audio_generations) + (select count(*) from public.audio_events) = 0, 'cascade';
end $$;
\echo 0029 OK
