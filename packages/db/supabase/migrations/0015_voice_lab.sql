-- Cineforge — schema part 15: Voice Lab (docs/29 phase 2) — cloned voices and
-- long-form voiceovers. Applied live as "voice_lab".
create table if not exists public.voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  sample_key text,
  provider text,
  provider_voice_id text,
  status text not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.voiceovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  voice_id uuid references public.voices(id) on delete set null,
  title text not null,
  text text not null,
  language text not null default 'en',
  audio_key text,
  status text not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.voices enable row level security;
alter table public.voiceovers enable row level security;
create policy voices_owner on public.voices for all using (user_id = auth.uid());
create policy voiceovers_owner on public.voiceovers for all using (user_id = auth.uid());
create index if not exists voices_user_idx on public.voices(user_id);
create index if not exists voiceovers_user_idx on public.voiceovers(user_id);
-- Realtime updates for the Voices page
alter publication supabase_realtime add table public.voices;
alter publication supabase_realtime add table public.voiceovers;
