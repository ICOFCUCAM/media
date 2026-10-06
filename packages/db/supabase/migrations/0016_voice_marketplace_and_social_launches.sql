-- Cineforge — schema part 16: voice marketplace + social launches.
-- Applied live as "voice_marketplace_and_social_launches".

-- Voice marketplace: owners offer voices under their terms; admin approves.
alter table public.voices add column if not exists share_status text not null default 'PRIVATE';
alter table public.voices add column if not exists share_terms text;
-- Everyone may see APPROVED community voices; the owner policy covers the rest.
create policy voices_community_read on public.voices for select using (share_status = 'APPROVED');
-- Admins review submissions. (Rewritten to use is_admin() in 0025.)
create policy voices_admin on public.voices for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'ADMIN')
);

-- Social launches: upload a video, AI builds the per-platform kit, one button posts.
create table if not exists public.social_launches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  video_key text not null,
  brief text not null default '',
  status text not null default 'PENDING',  -- PENDING -> KIT_READY -> LAUNCH_REQUESTED -> LAUNCHED/FAILED
  kit jsonb,        -- per-platform { title, description, hashtags }
  results jsonb,    -- per-platform publish outcome
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_launches enable row level security;
create policy social_launches_owner on public.social_launches for all using (user_id = auth.uid());
create index if not exists social_launches_user_idx on public.social_launches(user_id);
alter publication supabase_realtime add table public.social_launches;
