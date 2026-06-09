-- Cineforge — Supabase schema, part 3: ownership helpers + Row-Level Security.
-- Browser clients (anon/authenticated) are constrained to the signed-in user's
-- own data. Worker/API services use the service_role key, which BYPASSES RLS
-- (see docs/17-security.md) — they are the only writers of generated assets.

-- ─── Ownership helpers (defined here: bodies reference tables) ───
-- security definer so policies can traverse FKs without recursive RLS.
create or replace function public.owns_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and user_id = auth.uid());
$$;

create or replace function public.owns_scene(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from scenes sc
    join projects p on p.id = sc.project_id
    where sc.id = s and p.user_id = auth.uid()
  );
$$;

create or replace function public.owns_character(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from characters ch
    join projects p on p.id = ch.project_id
    where ch.id = c and p.user_id = auth.uid()
  );
$$;

create or replace function public.owns_series(sr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from series s
    join projects p on p.id = s.project_id
    where s.id = sr and p.user_id = auth.uid()
  );
$$;

create or replace function public.owns_season(se uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from seasons s
    join series sr on sr.id = s.series_id
    join projects p on p.id = sr.project_id
    where s.id = se and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'ADMIN');
$$;

-- Enable RLS everywhere.
alter table public.users             enable row level security;
alter table public.api_keys          enable row level security;
alter table public.projects          enable row level security;
alter table public.series            enable row level security;
alter table public.seasons           enable row level security;
alter table public.episodes          enable row level security;
alter table public.story_events      enable row level security;
alter table public.screenplays       enable row level security;
alter table public.characters        enable row level security;
alter table public.wardrobes         enable row level security;
alter table public.relationships     enable row level security;
alter table public.locations         enable row level security;
alter table public.world_objects     enable row level security;
alter table public.scenes            enable row level security;
alter table public.scene_characters  enable row level security;
alter table public.shots             enable row level security;
alter table public.dialogue_lines    enable row level security;
alter table public.audio_tracks      enable row level security;
alter table public.continuity_states enable row level security;
alter table public.render_jobs       enable row level security;
alter table public.films             enable row level security;
alter table public.usage_records     enable row level security;

-- ─── Identity & billing ─────────────────────────────────
create policy users_self_select on public.users
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy users_self_update on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy api_keys_owner on public.api_keys
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy usage_owner_read on public.usage_records
  for select to authenticated using (user_id = auth.uid());

-- ─── Projects (root ownership) ──────────────────────────
create policy projects_owner on public.projects
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Project-scoped children ────────────────────────────
create policy series_owner on public.series
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy story_events_owner on public.story_events
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy screenplays_owner on public.screenplays
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy characters_owner on public.characters
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy locations_owner on public.locations
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy world_objects_owner on public.world_objects
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy scenes_owner on public.scenes
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy continuity_states_owner on public.continuity_states
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy render_jobs_owner on public.render_jobs
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy films_owner on public.films
  for all to authenticated using (public.owns_project(project_id)) with check (public.owns_project(project_id));

-- ─── Deeper hierarchy ───────────────────────────────────
create policy seasons_owner on public.seasons
  for all to authenticated using (public.owns_series(series_id)) with check (public.owns_series(series_id));
create policy episodes_owner on public.episodes
  for all to authenticated using (public.owns_season(season_id)) with check (public.owns_season(season_id));
create policy wardrobes_owner on public.wardrobes
  for all to authenticated using (public.owns_character(character_id)) with check (public.owns_character(character_id));
create policy relationships_owner on public.relationships
  for all to authenticated using (public.owns_character(from_id)) with check (public.owns_character(from_id));
create policy scene_characters_owner on public.scene_characters
  for all to authenticated using (public.owns_scene(scene_id)) with check (public.owns_scene(scene_id));
create policy shots_owner on public.shots
  for all to authenticated using (public.owns_scene(scene_id)) with check (public.owns_scene(scene_id));
create policy dialogue_lines_owner on public.dialogue_lines
  for all to authenticated using (public.owns_scene(scene_id)) with check (public.owns_scene(scene_id));
create policy audio_tracks_owner on public.audio_tracks
  for all to authenticated using (public.owns_scene(scene_id)) with check (public.owns_scene(scene_id));
