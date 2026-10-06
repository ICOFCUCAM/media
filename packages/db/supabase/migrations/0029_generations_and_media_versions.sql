-- Cineforge — schema part 29: generation ledgers, immutable media versions and
-- audio placements (docs/38 §AU.16, §AV.5, §AW.10, §AW.13; Phase 4).
--
--  media_versions      every produced or derived asset version, immutable:
--                      storage key, sha256, duration on the clock, what it was
--                      derived from and how (e.g. a frame-rate conform record).
--  video_generations   one row per video generation attempt: what Cineforge
--                      asked for (duration µs, fps), which model / runtime /
--                      workflow / payload hash / gateway grant ran it, the
--                      runtime's timing report as received, and Cineforge's
--                      classification (ACCEPTED / REQUIRES_REPAIR /
--                      REQUIRES_REGENERATION / FAILED) under policy@version.
--  audio_generations   the same ledger for dialogue, narration, music, SFX and
--                      ambience (timing report required for success).
--  audio_events        placed audio on a timeline version: stem, sample-
--                      accurate [start_us, end_us), gain, fades. Generalizes
--                      audio_tracks.start_ms / duration_ms / gain_db.
--
-- The runtime never writes an outcome: classification columns are filled by
-- Cineforge's worker, once. Server-side writes only; owners and admins read.

create table public.media_versions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  asset_type     text not null check (asset_type in ('video', 'audio', 'image', 'subtitle', 'master')),
  asset_id       uuid not null,                     -- the logical asset (shot, dialogue line, …)
  version        int not null check (version >= 1),
  storage_key    text not null,
  sha256         text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  duration_us    bigint check (duration_us is null or duration_us >= 0),
  derived_from   uuid[] not null default '{}',
  derivation     jsonb,                             -- e.g. {"kind":"conform","method":"duplicate",…}
  generation_ref text,                              -- 'video_generations:<id>' | 'audio_generations:<id>'
  created_at     timestamptz not null default now(),
  unique (asset_type, asset_id, version)
);
create index media_versions_project_idx on public.media_versions (project_id, asset_type);

create table public.video_generations (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects (id) on delete cascade,
  shot_id               uuid references public.shots (id) on delete set null,
  timeline_version_id   uuid references public.production_timelines (id) on delete set null,
  attempt               int not null default 1 check (attempt >= 1),
  model_id              text not null,
  model_version         text,
  runtime               text not null default 'diffusers',
  runtime_version       text,
  workflow_id           text not null default 'cineforge.video-shot',
  workflow_version      int not null default 1,
  graph_sha256          text check (graph_sha256 is null or graph_sha256 ~ '^[0-9a-f]{64}$'),
  grant_id              text references public.runtime_execution_grants (id) on delete set null,
  requested_duration_us bigint not null check (requested_duration_us > 0),
  requested_fps_num     int not null check (requested_fps_num > 0),
  requested_fps_den     int not null default 1 check (requested_fps_den > 0),
  timing_constraints    jsonb not null default '{}',
  timing_report         jsonb,                      -- as received from the runtime
  actual_duration_us    bigint,
  outcome               text check (outcome in ('ACCEPTED', 'REQUIRES_REPAIR', 'REQUIRES_REGENERATION', 'FAILED')),
  outcome_code          text,
  policy                text,                       -- 'cinematic@1'
  decision              jsonb,                      -- the full classification (delta, ratio, repair)
  media_version_id      uuid references public.media_versions (id) on delete set null,
  gpu_ms                integer,
  created_at            timestamptz not null default now(),
  classified_at         timestamptz,
  constraint video_generations_outcome_complete check (
    (outcome is null) = (outcome_code is null) and (outcome is null) = (policy is null))
);
create index video_generations_shot_idx on public.video_generations (shot_id, created_at desc);
create index video_generations_outcome_idx on public.video_generations (project_id, outcome);

create table public.audio_generations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  kind              text not null check (kind in ('dialogue', 'narration', 'music', 'sfx', 'ambience')),
  dialogue_line_id  uuid,                           -- for dialogue (no FK: the ledger outlives edits)
  language          text,
  voice_id          text,
  provider          text not null,
  model_id          text,
  attempt           int not null default 1 check (attempt >= 1),
  requested_start_us bigint,
  requested_end_us   bigint,
  meta              jsonb not null default '{}',
  timing_report     jsonb,
  outcome           text check (outcome in ('ACCEPTED', 'REQUIRES_REPAIR', 'REQUIRES_REGENERATION', 'FAILED')),
  outcome_code      text,
  policy            text,
  media_version_id  uuid references public.media_versions (id) on delete set null,
  created_at        timestamptz not null default now(),
  classified_at     timestamptz,
  constraint audio_generations_span check (requested_end_us is null or requested_start_us is null or requested_end_us > requested_start_us),
  constraint audio_generations_outcome_complete check (
    (outcome is null) = (outcome_code is null) and (outcome is null) = (policy is null))
);
create index audio_generations_project_idx on public.audio_generations (project_id, kind);

create table public.audio_events (
  id                  uuid primary key default gen_random_uuid(),
  timeline_version_id uuid not null references public.production_timelines (id) on delete cascade,
  timeline_event_id   uuid references public.timeline_events (id) on delete cascade,
  audio_generation_id uuid references public.audio_generations (id) on delete set null,
  media_version_id    uuid references public.media_versions (id) on delete set null,
  stem                text not null check (stem in ('dialogue', 'narration', 'music', 'sfx', 'ambience')),
  start_us            bigint not null check (start_us >= 0),
  end_us              bigint not null,
  gain_db             numeric(6, 2) not null default 0,
  fade_in_us          bigint not null default 0 check (fade_in_us >= 0),
  fade_out_us         bigint not null default 0 check (fade_out_us >= 0),
  created_at          timestamptz not null default now(),
  constraint audio_events_interval check (end_us > start_us and fade_in_us + fade_out_us <= end_us - start_us)
);
create index audio_events_timeline_idx on public.audio_events (timeline_version_id, stem, start_us);

-- ── clock math for audio (mirrors sampleToUs / usToSample) ───────────────────
create or replace function public.clock_sample_start(k bigint, sample_rate int)
returns bigint language sql immutable strict parallel safe set search_path = '' as $$
  select floor((k::numeric * 1000000) / sample_rate)::bigint
$$;

create or replace function public.clock_is_sample_aligned(us bigint, sample_rate int)
returns boolean language sql immutable strict parallel safe set search_path = '' as $$
  select public.clock_sample_start(ceil(((us + 1)::numeric * sample_rate) / 1000000)::bigint - 1, sample_rate) = us
$$;

-- ── guards ───────────────────────────────────────────────────────────────────
-- Media versions are immutable once written.
create or replace function public.media_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;  -- project deletion cascades
  end if;
  raise exception 'media versions are immutable (write a new version)' using errcode = '42501';
end;
$$;
create trigger media_versions_immutable before update or delete on public.media_versions
  for each row execute function public.media_versions_immutable();

-- A generation's request and identity never change; its result and Cineforge's
-- classification are written once.
create or replace function public.generation_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
  write_once text[] := array['timing_report', 'actual_duration_us', 'outcome', 'outcome_code', 'policy',
                             'decision', 'media_version_id', 'gpu_ms', 'classified_at'];
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.projects where id = old.project_id) then
      raise exception '% rows cannot be deleted', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  for k in select jsonb_object_keys(n) loop
    if (o -> k) is distinct from (n -> k) then
      if not (k = any (write_once)) then
        -- shot_id / timeline_version_id may only be nulled by their FK (set null).
        if k in ('shot_id', 'timeline_version_id', 'grant_id', 'dialogue_line_id') and (n -> k) = 'null'::jsonb then
          continue;
        end if;
        raise exception '%.% is immutable', tg_table_name, k using errcode = '42501';
      end if;
      if (o -> k) is not null and (o -> k) <> 'null'::jsonb
         and not (k = 'media_version_id' and (n -> k) = 'null'::jsonb) then  -- FK set null
        raise exception '%.% is already set', tg_table_name, k using errcode = '42501';
      end if;
    end if;
  end loop;
  if new.outcome is not null and old.outcome is null then
    new.classified_at := coalesce(new.classified_at, now());
  end if;
  return new;
end;
$$;
create trigger video_generations_guard before update or delete on public.video_generations
  for each row execute function public.generation_ledger_guard();
create trigger audio_generations_guard before update or delete on public.audio_generations
  for each row execute function public.generation_ledger_guard();

-- Audio placements follow their timeline's lifecycle and are sample-accurate.
create or replace function public.audio_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t public.production_timelines;
begin
  select * into t from public.production_timelines where id = coalesce(new.timeline_version_id, old.timeline_version_id);
  if not found then
    return coalesce(new, old);
  end if;
  if t.status <> 'draft' then
    raise exception 'timeline % is %; its audio placements are immutable', t.id, t.status using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if not (public.clock_is_sample_aligned(new.start_us, t.sample_rate)
          and public.clock_is_sample_aligned(new.end_us, t.sample_rate)) then
    raise exception 'audio event [%, %) is not sample-aligned at % Hz', new.start_us, new.end_us, t.sample_rate
      using errcode = '22023';
  end if;
  if new.end_us > t.duration_us then
    raise exception 'audio event ends at % after the timeline duration %', new.end_us, t.duration_us using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger audio_events_guard before insert or update or delete on public.audio_events
  for each row execute function public.audio_events_guard();

-- ── access ───────────────────────────────────────────────────────────────────
alter table public.media_versions enable row level security;
alter table public.video_generations enable row level security;
alter table public.audio_generations enable row level security;
alter table public.audio_events enable row level security;

create policy media_versions_owner_read on public.media_versions
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy video_generations_owner_read on public.video_generations
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy audio_generations_owner_read on public.audio_generations
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy audio_events_owner_read on public.audio_events
  for select to authenticated using (exists (
    select 1 from public.production_timelines t
    where t.id = timeline_version_id and ((select public.owns_project(t.project_id)) or (select public.is_admin()))));

revoke all on public.media_versions, public.video_generations, public.audio_generations, public.audio_events from anon;
revoke insert, update, delete on public.media_versions, public.video_generations, public.audio_generations,
  public.audio_events from authenticated;
revoke execute on function public.clock_sample_start(bigint, int), public.clock_is_sample_aligned(bigint, int) from anon;
