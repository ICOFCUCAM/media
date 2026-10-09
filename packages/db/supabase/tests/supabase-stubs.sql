-- Minimal stand-ins for the Supabase objects migration 0026 depends on, so it
-- can be validated against a plain Postgres in CI.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
-- Minimal characters table (real definition: 0002) for validating 0027.
create table if not exists public.characters (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  name         text not null,
  appearance   text not null,
  lora_key     text,
  lora_version text
);
grant select, insert, update, delete on public.characters to anon, authenticated;
-- Minimal auth + projects for 0028–0030 (real: Supabase auth, 0002, 0003).
-- auth.uid() reads a test setting so RLS can be exercised as a given user.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
create table if not exists public.projects (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title   text not null default 'p'
);
grant select, insert, update, delete on public.projects to anon, authenticated;
create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade
);
create or replace function public.owns_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and user_id = auth.uid());
$$;
grant execute on function public.owns_project(uuid) to authenticated;
-- Minimal users + voices for 0036 (real: 0001, 0015/0016).
create table if not exists public.users (
  id uuid primary key default gen_random_uuid()
);
create table if not exists public.voices (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name    text not null,
  status  text not null default 'PENDING'
);
grant select, insert, update, delete on public.users, public.voices to anon, authenticated;
-- Minimal scenes / shot media / dialogue / audio for 0037 (real: 0002).
create table if not exists public.scenes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  index      int not null,
  summary    text not null default '',
  status     text not null default 'PENDING',
  updated_at timestamptz not null default now()
);
alter table public.shots add column if not exists scene_id uuid references public.scenes (id) on delete cascade;
alter table public.shots add column if not exists status text not null default 'PENDING';
alter table public.shots add column if not exists video_key text;
create table if not exists public.dialogue_lines (
  id       uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes (id) on delete cascade,
  index    int not null,
  text     text not null
);
create table if not exists public.audio_tracks (
  id       uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes (id) on delete cascade,
  key      text not null
);
grant select, insert, update, delete on public.scenes, public.dialogue_lines, public.audio_tracks to anon, authenticated;
-- project_status enum + shot seed column for 0040 (real: 0001, 0002).
do $$ begin
  create type public.project_status as enum ('DRAFT', 'PLANNING', 'GENERATING', 'RENDERING', 'PAUSED', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;
alter table public.shots add column if not exists seed_image_key text;
-- service_role + users balance/tier + usage_records for 0044 (real: Supabase, 0001, 0002).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
do $$ begin
  create type public.tier as enum ('FREE', 'CREATOR', 'STUDIO', 'ENTERPRISE');
exception when duplicate_object then null; end $$;
alter table public.users add column if not exists tier public.tier not null default 'FREE';
alter table public.users add column if not exists credits_ms integer not null default 0;
alter table public.users add column if not exists stripe_id text;
create table if not exists public.usage_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  project_id uuid,
  gpu_ms     int not null default 0,
  kind       text not null,
  cost_usd   double precision not null default 0,
  created_at timestamptz not null default now()
);
-- Minimal episodic hierarchy + ownership helpers for 0046 (real: 0002, 0003).
create table if not exists public.series (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid unique not null references public.projects(id) on delete cascade,
  title      text not null
);
create table if not exists public.seasons (
  id        uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  number    integer not null,
  unique (series_id, number)
);
create table if not exists public.episodes (
  id        uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  number    integer not null,
  title     text not null,
  unique (season_id, number)
);
grant select, insert, update, delete on public.series, public.seasons, public.episodes to anon, authenticated;
create or replace function public.owns_character(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from characters ch join projects p on p.id = ch.project_id where ch.id = c and p.user_id = auth.uid());
$$;
create or replace function public.owns_series(sr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from series s join projects p on p.id = s.project_id where s.id = sr and p.user_id = auth.uid());
$$;
grant execute on function public.owns_character(uuid), public.owns_series(uuid) to authenticated;
-- projects.mode / status for 0047 (real: 0002, 0006).
alter table public.projects add column if not exists mode text not null default 'auto';
alter table public.projects add column if not exists status text not null default 'DRAFT';
-- voices sharing + voiceovers for 0050 (real: 0015, 0016).
alter table public.voices add column if not exists share_status text not null default 'PRIVATE';
alter table public.voices add column if not exists share_terms text;
create table if not exists public.voiceovers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  voice_id   uuid references public.voices (id) on delete set null,
  title      text not null,
  text       text not null,
  language   text not null default 'en',
  audio_key  text,
  status     text not null default 'PENDING',
  error_message text
);
alter table public.voiceovers enable row level security;
drop policy if exists voiceovers_owner on public.voiceovers;
create policy voiceovers_owner on public.voiceovers for all using (user_id = auth.uid());
grant select, insert, update, delete on public.voiceovers to anon, authenticated;
