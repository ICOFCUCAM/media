-- Cineforge — schema part 36: Voice Engine (DirectorOS W7; Part 4 §157–176).
--
--  voices (altered)         consent is recorded with every voice (§168): who
--                           the voice belongs to (self | authorised) and when
--                           the uploader confirmed it. Older voices have none;
--                           the worker and the /v1 API refuse to enroll a
--                           voice without it. Also the reference language and
--                           the recording-quality report (§161).
--  voice_engine_artifacts   what an engine produced when it enrolled a voice
--                           (a provider voice id, an embedding, a prompt clip)
--                           — one row per voice × engine × engine version, so
--                           an engine upgrade re-enrolls instead of reusing an
--                           artifact it cannot read. Engine internals: service
--                           role only, never shown to clients (§163).
--  voice_jobs               every enrollment / synthesis / batch job and its
--                           state (§164): queued → claimed → loading_model →
--                           generating → post_processing → completed, or
--                           failed / cancelled. Terminal states are final.
--
-- Written by the worker and the API (service role); owners read their own jobs.

alter table public.voices
  add column if not exists consent_type text check (consent_type in ('self', 'authorised')),
  add column if not exists consent_confirmed_at timestamptz,
  add column if not exists language text check (language is null or length(language) between 2 and 16),
  add column if not exists quality jsonb check (quality is null or jsonb_typeof(quality) = 'object');
alter table public.voices
  add constraint voices_consent_pair check ((consent_type is null) = (consent_confirmed_at is null));

create table public.voice_engine_artifacts (
  id              uuid primary key default gen_random_uuid(),
  voice_id        uuid not null references public.voices (id) on delete cascade,
  engine_id       text not null check (length(engine_id) between 1 and 64),
  engine_version  text not null check (length(engine_version) between 1 and 64),
  artifact_type   text not null check (artifact_type in ('provider_voice_id', 'speaker_embedding', 'prompt_audio', 'reference_audio', 'adapter_weights')),
  artifact_uri    text not null check (length(artifact_uri) between 1 and 1024),
  metadata        jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at      timestamptz not null default now(),
  unique (voice_id, engine_id, engine_version)
);

alter table public.voice_engine_artifacts enable row level security;
create policy voice_engine_artifacts_admin_read on public.voice_engine_artifacts
  for select to authenticated using ((select public.is_admin()));
revoke all on public.voice_engine_artifacts from anon;
revoke insert, update, delete on public.voice_engine_artifacts from authenticated;

create table public.voice_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  voice_id      uuid references public.voices (id) on delete set null,
  type          text not null check (type in ('voice.enroll', 'speech.synthesis', 'speech.batch')),
  engine        text check (engine is null or length(engine) between 1 and 64),
  status        text not null default 'queued'
                check (status in ('queued', 'claimed', 'loading_model', 'generating', 'post_processing', 'completed', 'failed', 'cancelled')),
  payload       jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  result        jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error         text check (error is null or length(error) <= 2000),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index voice_jobs_user_idx on public.voice_jobs (user_id, created_at);
create index voice_jobs_status_idx on public.voice_jobs (status);

create or replace function public.voice_jobs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.type <> old.type then
    raise exception 'a voice job keeps its owner and type' using errcode = '42501';
  end if;
  if old.status in ('completed', 'failed', 'cancelled') and new.status <> old.status then
    raise exception 'voice job % is %; terminal states are final', old.id, old.status using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger voice_jobs_guard before update on public.voice_jobs
  for each row execute function public.voice_jobs_guard();

alter table public.voice_jobs enable row level security;
create policy voice_jobs_owner_read on public.voice_jobs
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.voice_jobs from anon;
revoke insert, update, delete on public.voice_jobs from authenticated;
