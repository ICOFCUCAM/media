-- Cineforge — Supabase schema, part 2: tables + indexes.
-- snake_case mirror of packages/db/prisma/schema.prisma. uuid PKs throughout;
-- public.users.id == auth.users.id.

-- ─── Identity & billing ─────────────────────────────────
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  display_name  text,
  role          role not null default 'USER',
  tier          tier not null default 'FREE',
  credits_ms    integer not null default 0,   -- remaining GPU-ms budget
  stripe_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.api_keys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  hashed     text unique not null,
  label      text,
  last_used  timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_user_idx on public.api_keys(user_id);

-- ─── Project / film ─────────────────────────────────────
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  title          text not null,
  prompt         text not null,
  target_seconds integer not null,
  aspect_ratio   text not null default '16:9',
  model_id       text not null default 'wan-2.1',
  status         project_status not null default 'DRAFT',
  progress       double precision not null default 0,   -- 0..1
  estimated_ms   integer,
  spent_ms       integer not null default 0,
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists projects_user_status_idx on public.projects(user_id, status);

-- ─── Phase 3 — episodic hierarchy (docs/24 §C/D) ────────
create table if not exists public.series (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid unique not null references public.projects(id) on delete cascade,
  title      text not null,
  synopsis   text,
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  series_id  uuid not null references public.series(id) on delete cascade,
  number     integer not null,
  title      text,
  created_at timestamptz not null default now(),
  unique (series_id, number)
);

create table if not exists public.episodes (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons(id) on delete cascade,
  number     integer not null,
  title      text not null,
  synopsis   text,
  created_at timestamptz not null default now(),
  unique (season_id, number)
);

-- Append-only canon log (docs/24 §C4).
create table if not exists public.story_events (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  episode_index integer,
  scene_index   integer,
  kind          text not null,
  summary       text not null,
  payload       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists story_events_idx
  on public.story_events(project_id, episode_index, scene_index);

-- ─── Screenplay (Director AI output) ────────────────────
create table if not exists public.screenplays (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid unique not null references public.projects(id) on delete cascade,
  logline    text not null,
  synopsis   text not null,
  genre      text,
  tone       text,
  acts       jsonb not null,
  raw        jsonb not null,
  created_at timestamptz not null default now()
);

-- ─── Character Bible ────────────────────────────────────
create table if not exists public.characters (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  name           text not null,
  age            integer,
  gender         text,
  ethnicity      text,
  appearance     text not null,
  personality    text,
  voice_profile  jsonb,
  arc            text,
  reference_urls text[] not null default '{}',
  embedding      vector(512),               -- identity embedding (docs/24 §C3)
  lora_key       text,
  lora_version   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists characters_project_idx on public.characters(project_id);

create table if not exists public.wardrobes (
  id               uuid primary key default gen_random_uuid(),
  character_id     uuid not null references public.characters(id) on delete cascade,
  label            text not null,
  description      text not null,
  valid_from_scene integer,
  valid_to_scene   integer
);
create index if not exists wardrobes_character_idx on public.wardrobes(character_id);

create table if not exists public.relationships (
  id      uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.characters(id) on delete cascade,
  to_id   uuid not null references public.characters(id) on delete cascade,
  kind    text not null,
  unique (from_id, to_id, kind)
);

-- ─── World Bible ────────────────────────────────────────
create table if not exists public.locations (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  name           text not null,
  kind           location_kind not null,
  description    text not null,
  parent_id      uuid references public.locations(id) on delete set null,
  reference_urls text[] not null default '{}',
  created_at     timestamptz not null default now()
);
create index if not exists locations_project_idx on public.locations(project_id);

create table if not exists public.world_objects (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  name           text not null,
  description    text not null,
  reference_urls text[] not null default '{}'
);
create index if not exists world_objects_project_idx on public.world_objects(project_id);

-- ─── Scenes & shots ─────────────────────────────────────
create table if not exists public.scenes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  index        integer not null,
  location_id  uuid references public.locations(id) on delete set null,
  heading      text not null,
  summary      text not null,
  episode_id   uuid references public.episodes(id) on delete set null,
  time_of_day  text,
  weather      text,
  status       scene_status not null default 'PENDING',
  duration_sec double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, index)
);
create index if not exists scenes_project_status_idx on public.scenes(project_id, status);

create table if not exists public.scene_characters (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references public.scenes(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  wardrobe_id  uuid references public.wardrobes(id) on delete set null,
  unique (scene_id, character_id)
);

create table if not exists public.shots (
  id              uuid primary key default gen_random_uuid(),
  scene_id        uuid not null references public.scenes(id) on delete cascade,
  index           integer not null,
  prompt          text not null,
  negative_prompt text,
  camera_plan     jsonb,
  seed            bigint,
  duration_sec    double precision not null default 5,
  model_id        text not null default 'wan-2.1',
  model_version   text,
  prompt_hash     text,
  cache_key       text,
  status          shot_status not null default 'PENDING',
  video_key       text,
  thumbnail_key   text,
  qc_score        double precision,
  gpu_ms          integer,
  attempts        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (scene_id, index)
);
create index if not exists shots_status_idx on public.shots(status);
create index if not exists shots_cache_key_idx on public.shots(cache_key);

create table if not exists public.dialogue_lines (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references public.scenes(id) on delete cascade,
  index        integer not null,
  character_id uuid references public.characters(id) on delete set null,
  text         text not null,
  emotion      text,
  audio_key    text,
  start_ms     integer
);
create index if not exists dialogue_lines_scene_idx on public.dialogue_lines(scene_id);

create table if not exists public.audio_tracks (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  kind        audio_kind not null,
  key         text not null,
  start_ms    integer not null default 0,
  duration_ms integer,
  gain_db     double precision not null default 0,
  meta        jsonb
);
create index if not exists audio_tracks_scene_kind_idx on public.audio_tracks(scene_id, kind);

-- ─── Continuity Engine ──────────────────────────────────
create table if not exists public.continuity_states (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  scene_index integer not null,
  state       jsonb not null,
  created_at  timestamptz not null default now(),
  unique (project_id, scene_index)
);
create index if not exists continuity_states_project_idx on public.continuity_states(project_id);

-- ─── Film & rendering ───────────────────────────────────
create table if not exists public.render_jobs (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind       text not null default 'final',
  status     render_status not null default 'QUEUED',
  progress   double precision not null default 0,
  output_key text,
  log        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists render_jobs_project_status_idx on public.render_jobs(project_id, status);

create table if not exists public.films (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid unique not null references public.projects(id) on delete cascade,
  mp4_key      text not null,
  hls_key      text,
  poster_key   text,
  duration_sec double precision not null,
  subtitle_key text,
  size_bytes   bigint,
  version      integer not null default 1,
  views        integer not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ─── Usage / quotas ─────────────────────────────────────
create table if not exists public.usage_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  gpu_ms     integer not null default 0,
  kind       text not null,
  cost_usd   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_records_user_idx on public.usage_records(user_id, created_at);

-- ─── updated_at triggers ────────────────────────────────
create trigger users_set_updated_at      before update on public.users       for each row execute function public.set_updated_at();
create trigger projects_set_updated_at   before update on public.projects    for each row execute function public.set_updated_at();
create trigger characters_set_updated_at before update on public.characters  for each row execute function public.set_updated_at();
create trigger scenes_set_updated_at     before update on public.scenes      for each row execute function public.set_updated_at();
create trigger shots_set_updated_at      before update on public.shots       for each row execute function public.set_updated_at();
create trigger render_jobs_set_updated_at before update on public.render_jobs for each row execute function public.set_updated_at();

-- profile mirror trigger (function defined in 0001)
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
