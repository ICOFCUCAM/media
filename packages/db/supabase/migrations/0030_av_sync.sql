-- Cineforge — schema part 30: synchronization policies, A/V sync reports and
-- issues, and repair jobs (docs/38 §AU.7, §AU.12, §AU.16, §AW.9; Phase 4 data
-- model for the Phase 5 A/V Sync Engine and the Phase 9 repair engine).
--
--  sync_policies     versioned tolerance profiles. A row never changes:
--                    calibration writes a new version, and every report and
--                    outcome cites profile@version. Seeded with the starting
--                    defaults of packages/shared/src/sync/policy.ts (a CI test
--                    keeps the two identical). calibrated = false until the
--                    benchmark says otherwise.
--  av_sync_reports   one per analysis run of a timeline version (append-only).
--  av_sync_issues    individual findings; only their status moves (open →
--                    repairing → resolved | waived, waiving needs a reason).
--  repair_jobs       planned / executed repairs for an issue; the planned
--                    action never changes after it is written.

create table public.sync_policies (
  id          text not null,
  version     int not null check (version >= 1),
  tolerances  jsonb not null,               -- µs (and LU for loudness)
  repair      jsonb not null,               -- maxRetimeRatio, maxTrimUs, maxHoldUs, maxAttempts
  delivery    jsonb not null,               -- loudness / true-peak targets, sample rate, subtitle formats
  calibrated  boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (id, version)
);

insert into public.sync_policies (id, version, tolerances, repair, delivery, calibrated) values
  ('cinematic', 1, '{"dialogueStartUs":80000,"dialogueEndUs":80000,"lipSyncLeadUs":45000,"lipSyncLagUs":125000,"musicCueUs":80000,"sfxUs":40000,"subtitleUs":42000,"durationUs":42000,"driftUs":40000,"loudnessLu":1}', '{"maxRetimeRatio":0.04,"maxTrimUs":1000000,"maxHoldUs":500000,"maxAttempts":3}', '{"integratedLufs":-16,"truePeakDbtp":-1,"sampleRate":48000,"subtitleFormats":["srt","vtt"]}', false),
  ('documentary', 1, '{"dialogueStartUs":100000,"dialogueEndUs":100000,"lipSyncLeadUs":45000,"lipSyncLagUs":125000,"musicCueUs":120000,"sfxUs":60000,"subtitleUs":42000,"durationUs":84000,"driftUs":60000,"loudnessLu":1}', '{"maxRetimeRatio":0.04,"maxTrimUs":1000000,"maxHoldUs":500000,"maxAttempts":3}', '{"integratedLufs":-16,"truePeakDbtp":-1,"sampleRate":48000,"subtitleFormats":["srt","vtt"]}', false),
  ('social', 1, '{"dialogueStartUs":120000,"dialogueEndUs":120000,"lipSyncLeadUs":90000,"lipSyncLagUs":185000,"musicCueUs":150000,"sfxUs":75000,"subtitleUs":84000,"durationUs":125000,"driftUs":100000,"loudnessLu":1}', '{"maxRetimeRatio":0.06,"maxTrimUs":1000000,"maxHoldUs":500000,"maxAttempts":3}', '{"integratedLufs":-14,"truePeakDbtp":-1,"sampleRate":48000,"subtitleFormats":["srt","vtt"]}', false),
  ('broadcast', 1, '{"dialogueStartUs":60000,"dialogueEndUs":60000,"lipSyncLeadUs":40000,"lipSyncLagUs":60000,"musicCueUs":80000,"sfxUs":40000,"subtitleUs":40000,"durationUs":40000,"driftUs":40000,"loudnessLu":1}', '{"maxRetimeRatio":0.02,"maxTrimUs":1000000,"maxHoldUs":500000,"maxAttempts":3}', '{"integratedLufs":-23,"truePeakDbtp":-1,"sampleRate":48000,"subtitleFormats":["srt","vtt"]}', false),
  ('education', 1, '{"dialogueStartUs":120000,"dialogueEndUs":120000,"lipSyncLeadUs":90000,"lipSyncLagUs":185000,"musicCueUs":150000,"sfxUs":75000,"subtitleUs":84000,"durationUs":125000,"driftUs":80000,"loudnessLu":1}', '{"maxRetimeRatio":0.04,"maxTrimUs":1000000,"maxHoldUs":500000,"maxAttempts":3}', '{"integratedLufs":-16,"truePeakDbtp":-1,"sampleRate":48000,"subtitleFormats":["srt","vtt"]}', false),
  ('corporate', 1, '{"dialogueStartUs":100000,"dialogueEndUs":100000,"lipSyncLeadUs":90000,"lipSyncLagUs":185000,"musicCueUs":120000,"sfxUs":60000,"subtitleUs":84000,"durationUs":84000,"driftUs":80000,"loudnessLu":1}', '{"maxRetimeRatio":0.04,"maxTrimUs":1000000,"maxHoldUs":500000,"maxAttempts":3}', '{"integratedLufs":-16,"truePeakDbtp":-1,"sampleRate":48000,"subtitleFormats":["srt","vtt"]}', false);

create table public.av_sync_reports (
  id                  uuid primary key default gen_random_uuid(),
  timeline_version_id uuid not null references public.production_timelines (id) on delete cascade,
  scope               jsonb not null default '{}',     -- {sceneIds?, shotIds?}
  checks              text[] not null,
  passed              boolean not null,
  policy              text not null,                   -- 'cinematic@1'
  tool_versions       jsonb not null default '{}',
  created_at          timestamptz not null default now()
);
create index av_sync_reports_timeline_idx on public.av_sync_reports (timeline_version_id, created_at desc);

create table public.av_sync_issues (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.av_sync_reports (id) on delete cascade,
  "check"       text not null check ("check" in (
                  'duration', 'dialogue_alignment', 'lip_sync', 'music_cue', 'sfx_cue', 'subtitle',
                  'loudness', 'frame_rate', 'drift', 'transitions', 'silence', 'clipping',
                  'black_frames', 'dropped_frames', 'missing_media', 'provenance')),
  severity      text not null check (severity in ('info', 'warning', 'error', 'blocker')),
  scene_id      uuid,
  shot_id       uuid,
  event_id      uuid,
  at_us         bigint not null check (at_us >= 0),
  span_us       bigint check (span_us is null or span_us >= 0),
  measured      jsonb not null default '{}',
  expected      jsonb not null default '{}',
  confidence    numeric(4, 3) not null check (confidence between 0 and 1),
  message       text not null,
  status        text not null default 'open' check (status in ('open', 'repairing', 'resolved', 'waived')),
  waiver_reason text,
  resolved_at   timestamptz,
  constraint av_sync_issues_waiver check (status <> 'waived' or coalesce(length(trim(waiver_reason)), 0) > 0)
);
create index av_sync_issues_report_idx on public.av_sync_issues (report_id, severity);
create index av_sync_issues_open_idx on public.av_sync_issues (status) where status in ('open', 'repairing');

create table public.repair_jobs (
  id                      uuid primary key default gen_random_uuid(),
  issue_id                uuid not null references public.av_sync_issues (id) on delete cascade,
  action                  jsonb not null,              -- RepairAction
  status                  text not null default 'planned' check (status in ('planned', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt                 int not null default 1 check (attempt >= 1),
  result_media_version_id uuid references public.media_versions (id) on delete set null,
  error                   text,
  created_at              timestamptz not null default now(),
  finished_at             timestamptz
);
create index repair_jobs_issue_idx on public.repair_jobs (issue_id, attempt);

-- ── guards ───────────────────────────────────────────────────────────────────
create or replace function public.append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Cascades from a deleted parent are allowed (the parent row is already gone).
  if tg_op = 'DELETE' and tg_table_name = 'av_sync_reports' then
    if not exists (select 1 from public.production_timelines where id = (to_jsonb(old) ->> 'timeline_version_id')::uuid) then
      return old;
    end if;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger sync_policies_append_only before update or delete on public.sync_policies
  for each row execute function public.append_only();
create trigger av_sync_reports_append_only before update or delete on public.av_sync_reports
  for each row execute function public.append_only();

create or replace function public.av_sync_issues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.av_sync_reports where id = old.report_id) then
      raise exception 'sync issues are kept (waive or resolve them)' using errcode = '42501';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - array['status', 'waiver_reason', 'resolved_at'])
     is distinct from (to_jsonb(old) - array['status', 'waiver_reason', 'resolved_at']) then
    raise exception 'only the status of a sync issue can change' using errcode = '42501';
  end if;
  if old.status in ('resolved', 'waived') and new.status is distinct from old.status then
    raise exception 'issue is already %', old.status using errcode = '42501';
  end if;
  if new.status in ('resolved', 'waived') and old.status not in ('resolved', 'waived') then
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
end;
$$;
create trigger av_sync_issues_guard before update or delete on public.av_sync_issues
  for each row execute function public.av_sync_issues_guard();

create or replace function public.repair_jobs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.av_sync_issues where id = old.issue_id) then
      raise exception 'repair jobs are kept' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.issue_id is distinct from old.issue_id or new.action is distinct from old.action
     or new.attempt is distinct from old.attempt or new.created_at is distinct from old.created_at then
    raise exception 'a repair job''s planned action is immutable' using errcode = '42501';
  end if;
  if old.status in ('succeeded', 'failed', 'cancelled') and new.status is distinct from old.status then
    raise exception 'repair job already %', old.status using errcode = '42501';
  end if;
  if new.status in ('succeeded', 'failed', 'cancelled') and old.status not in ('succeeded', 'failed', 'cancelled') then
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end;
$$;
create trigger repair_jobs_guard before update or delete on public.repair_jobs
  for each row execute function public.repair_jobs_guard();

-- ── access ───────────────────────────────────────────────────────────────────
alter table public.sync_policies enable row level security;
alter table public.av_sync_reports enable row level security;
alter table public.av_sync_issues enable row level security;
alter table public.repair_jobs enable row level security;

-- Tolerance profiles are product configuration, not user data: any signed-in user may read them.
create policy sync_policies_read on public.sync_policies for select to authenticated using (true);
create policy av_sync_reports_owner_read on public.av_sync_reports
  for select to authenticated using (exists (
    select 1 from public.production_timelines t
    where t.id = timeline_version_id and ((select public.owns_project(t.project_id)) or (select public.is_admin()))));
create policy av_sync_issues_owner_read on public.av_sync_issues
  for select to authenticated using (exists (
    select 1 from public.av_sync_reports r join public.production_timelines t on t.id = r.timeline_version_id
    where r.id = report_id and ((select public.owns_project(t.project_id)) or (select public.is_admin()))));
create policy repair_jobs_owner_read on public.repair_jobs
  for select to authenticated using (exists (
    select 1 from public.av_sync_issues i
    join public.av_sync_reports r on r.id = i.report_id
    join public.production_timelines t on t.id = r.timeline_version_id
    where i.id = issue_id and ((select public.owns_project(t.project_id)) or (select public.is_admin()))));

revoke all on public.sync_policies, public.av_sync_reports, public.av_sync_issues, public.repair_jobs from anon;
revoke insert, update, delete on public.sync_policies, public.av_sync_reports, public.av_sync_issues,
  public.repair_jobs from authenticated;
