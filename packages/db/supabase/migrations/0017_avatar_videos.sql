-- Cineforge — schema part 17: talking-avatar videos (docs/29 phase 3) — a
-- portrait photo lip-synced to a Voice Lab voiceover. Applied live as "avatar_videos".
create table if not exists public.avatar_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  voiceover_id uuid references public.voiceovers(id) on delete set null,
  title text not null default '',
  image_key text not null,
  status text not null default 'PENDING',  -- PENDING -> RENDERING -> READY/FAILED
  video_key text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.avatar_videos enable row level security;
create policy avatar_videos_owner on public.avatar_videos for all using (user_id = auth.uid());
create index if not exists avatar_videos_user_idx on public.avatar_videos(user_id);
alter publication supabase_realtime add table public.avatar_videos;
