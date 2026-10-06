-- Cineforge — schema part 28: the Master Production Clock in the database
-- (docs/38 §AU.4, §AU.16, §AW.3, §AW.13; implementation Phase 4 in §AX.2).
--
--  production_timelines  one row per timeline VERSION of a project: the
--                        production's single frame rate (exact rational), audio
--                        sample rate, duration in integer microseconds, status
--                        and the sync policy (profile@version) it is judged by.
--  timeline_events       every timed thing placed on that clock — scenes,
--                        shots, dialogue, words, narration, music cues, SFX,
--                        ambience, subtitles, transitions, titles, VFX, visual
--                        actions — as [start_us, end_us) with optional
--                        parentage and anchors (§AU.11).
--
-- Rules enforced here (the TypeScript MasterClock implements the same math):
--   * times are bigint microseconds; rates are (fps_num, fps_den);
--   * picture events (scene, shot, subtitle, transition, title) start and end
--     on frame boundaries: frame n starts at floor(n·1e6·den/num) µs;
--   * a timeline is editable only while 'draft'; once approved its events and
--     clock are immutable — edits produce a new version (§AU.4).
--
-- Server-side writes only (the worker's own connection); owners and admins
-- may read. No billing or credit changes.

create table public.production_timelines (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  version             int not null check (version >= 1),
  parent_version_id   uuid references public.production_timelines (id) on delete set null,
  fps_num             int not null check (fps_num > 0),
  fps_den             int not null check (fps_den > 0),
  sample_rate         int not null default 48000 check (sample_rate > 0),
  duration_us         bigint not null default 0 check (duration_us >= 0),
  status              text not null default 'draft' check (status in ('draft', 'approved', 'superseded', 'frozen')),
  sync_policy_id      text not null default 'cinematic',
  sync_policy_version int not null default 1 check (sync_policy_version >= 1),
  created_at          timestamptz not null default now(),
  approved_at         timestamptz,
  unique (project_id, version)
);
create index production_timelines_project_idx on public.production_timelines (project_id, version desc);

create table public.timeline_events (
  id                  uuid primary key default gen_random_uuid(),
  timeline_version_id uuid not null references public.production_timelines (id) on delete cascade,
  kind                text not null check (kind in (
                        'scene', 'shot', 'dialogue', 'word', 'narration', 'music_cue', 'sfx',
                        'ambience', 'subtitle', 'transition', 'title', 'vfx', 'action')),
  start_us            bigint not null check (start_us >= 0),
  end_us              bigint not null,
  ref_type            text,                -- 'shot' | 'dialogue_line' | 'audio_generation' | …
  ref_id              uuid,
  parent_event_id     uuid references public.timeline_events (id) on delete cascade,
  anchor_event_id     uuid references public.timeline_events (id) on delete set null,
  anchor_offset_us    bigint,
  anchor_mode         text check (anchor_mode in ('start', 'end', 'action', 'cut')),
  payload             jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  constraint timeline_events_interval check (end_us >= start_us),
  constraint timeline_events_anchor check ((anchor_event_id is null) = (anchor_mode is null)
                                           and (anchor_event_id is null or anchor_offset_us is not null))
);
create index timeline_events_timeline_idx on public.timeline_events (timeline_version_id, start_us);
create index timeline_events_ref_idx on public.timeline_events (ref_type, ref_id);

-- ── clock math (mirrors packages/shared/src/clock/time.ts) ───────────────────
create or replace function public.clock_frame_start(n bigint, fps_num int, fps_den int)
returns bigint language sql immutable strict parallel safe set search_path = '' as $$
  select floor((n::numeric * 1000000 * fps_den) / fps_num)::bigint
$$;

create or replace function public.clock_frame_at(us bigint, fps_num int, fps_den int)
returns bigint language sql immutable strict parallel safe set search_path = '' as $$
  select (ceil(((us + 1)::numeric * fps_num) / (1000000::numeric * fps_den)) - 1)::bigint
$$;

create or replace function public.clock_is_frame_aligned(us bigint, fps_num int, fps_den int)
returns boolean language sql immutable strict parallel safe set search_path = '' as $$
  select public.clock_frame_start(public.clock_frame_at(us, fps_num, fps_den), fps_num, fps_den) = us
$$;

-- ── guards ───────────────────────────────────────────────────────────────────
create or replace function public.timeline_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t public.production_timelines;
  tid uuid := coalesce(new.timeline_version_id, old.timeline_version_id);
begin
  select * into t from public.production_timelines where id = tid;
  if not found then
    -- The timeline itself is being deleted (cascade from a draft or a deleted project).
    return coalesce(new, old);
  end if;
  if t.status is distinct from 'draft' then
    raise exception 'timeline % is %; its events are immutable (edit a new version)', tid, t.status
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.kind in ('scene', 'shot', 'subtitle', 'transition', 'title')
     and not (public.clock_is_frame_aligned(new.start_us, t.fps_num, t.fps_den)
              and public.clock_is_frame_aligned(new.end_us, t.fps_num, t.fps_den)) then
    raise exception '% event [%, %) is not on frame boundaries at %/%',
      new.kind, new.start_us, new.end_us, t.fps_num, t.fps_den using errcode = '22023';
  end if;
  if new.end_us > t.duration_us then
    raise exception 'event ends at % after the timeline duration %', new.end_us, t.duration_us
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger timeline_events_guard before insert or update or delete on public.timeline_events
  for each row execute function public.timeline_events_guard();

create or replace function public.production_timelines_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Project deletion cascades; otherwise only drafts can be removed.
    if old.status <> 'draft' and exists (select 1 from public.projects where id = old.project_id) then
      raise exception 'only draft timelines can be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    -- The clock of an approved version never changes; only its lifecycle moves on.
    if new.project_id is distinct from old.project_id or new.version is distinct from old.version
       or new.fps_num is distinct from old.fps_num or new.fps_den is distinct from old.fps_den
       or new.sample_rate is distinct from old.sample_rate or new.duration_us is distinct from old.duration_us
       or new.sync_policy_id is distinct from old.sync_policy_id
       or new.sync_policy_version is distinct from old.sync_policy_version
       or new.parent_version_id is distinct from old.parent_version_id then
      raise exception 'timeline % is %; its clock is immutable', old.id, old.status using errcode = '42501';
    end if;
    if not ((old.status = 'approved' and new.status in ('approved', 'superseded', 'frozen'))
            or (old.status = new.status)) then
      raise exception 'timeline status cannot go from % to %', old.status, new.status using errcode = '42501';
    end if;
  end if;
  if new.status = 'approved' and old.status = 'draft' then
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;
create trigger production_timelines_guard before update or delete on public.production_timelines
  for each row execute function public.production_timelines_guard();

-- ── access ───────────────────────────────────────────────────────────────────
alter table public.production_timelines enable row level security;
alter table public.timeline_events enable row level security;

create policy production_timelines_owner_read on public.production_timelines
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy timeline_events_owner_read on public.timeline_events
  for select to authenticated using (exists (
    select 1 from public.production_timelines t
    where t.id = timeline_version_id and ((select public.owns_project(t.project_id)) or (select public.is_admin()))));

revoke all on public.production_timelines, public.timeline_events from anon;
revoke insert, update, delete on public.production_timelines, public.timeline_events from authenticated;
revoke execute on function public.clock_frame_start(bigint, int, int), public.clock_frame_at(bigint, int, int),
  public.clock_is_frame_aligned(bigint, int, int) from anon;
