-- Cineforge — schema part 46: the Animation Studio (DirectorOS W12; Part 5
-- §179–185).
--
--  characters      Character Card fields (§179.2, §183): height, hair, eyes,
--                  usual clothing, animation style, and the animated design
--                  (proportions, palette, movement — §179.4). A card is a
--                  character in the owner's Library; a production's
--                  character cast from a card points back at it
--                  (source_character_id), so Kito in Film 2 is Kito.
--  project_cast    the cards an owner cast into a production ("Use
--                  character"); the Director must use them as given.
--  show_bibles     a show's bible (§184): genre, audience, world rules,
--                  locations, music identity, narrative rules, episode
--                  format, continuity rules. Title is the series title; the
--                  visual style is the show project's animation style; the
--                  character bible and voice cast are the show's cast.
--  projects        an EPISODE production (kind 'episode') belongs to a show
--                  (series_id) and has a number; it reads the bible and what
--                  earlier episodes established. A series planned in one pass
--                  keeps at most 5 episodes (the Film IR has at most 5 acts);
--                  longer shows are made episode by episode.
--  episodes        the production that made each episode (project_id).

-- ─── Character Cards ─────────────────────────────────────
alter table public.characters
  add column if not exists height_cm int,
  add column if not exists hair text,
  add column if not exists eyes text,
  add column if not exists clothing text,
  add column if not exists animation_style text,
  add column if not exists design jsonb,
  add column if not exists source_character_id uuid references public.characters(id) on delete set null;

alter table public.characters
  add constraint characters_height_check check (height_cm is null or height_cm between 20 and 400),
  add constraint characters_animation_style_check check (animation_style is null or animation_style in (
    '2d_traditional', '2d_tv', 'anime', 'comic_book', 'childrens_illustration',
    '3d_stylized', '3d_toy', '3d_family', '3d_cinematic', 'low_poly', 'storybook', 'motion_comic')),
  add constraint characters_design_check check (design is null or (
    jsonb_typeof(design) = 'object'
    and coalesce(jsonb_typeof(design -> 'proportions'), '') = 'string'
    and coalesce(jsonb_typeof(design -> 'palette'), '') = 'string'
    and coalesce(jsonb_typeof(design -> 'movement'), '') = 'string')),
  add constraint characters_source_not_self check (source_character_id is null or source_character_id <> id);

create index if not exists characters_source_idx on public.characters(source_character_id);

-- ─── Cast: cards used in a production ────────────────────
create table public.project_cast (
  project_id   uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (project_id, character_id)
);
create index project_cast_character_idx on public.project_cast(character_id);

alter table public.project_cast enable row level security;
-- Both sides must be the owner's: nobody casts someone else's character.
create policy project_cast_owner on public.project_cast
  for all to authenticated
  using (public.owns_project(project_id))
  with check (public.owns_project(project_id) and public.owns_character(character_id));

-- ─── Show Bible ──────────────────────────────────────────
create table public.show_bibles (
  series_id        uuid primary key references public.series(id) on delete cascade,
  genre            text,
  audience         text,
  world_rules      text,
  locations        text,
  music_identity   text,
  narrative_rules  text,
  episode_format   text,
  continuity_rules text,
  updated_at       timestamptz not null default now()
);

alter table public.show_bibles enable row level security;
create policy show_bibles_owner on public.show_bibles
  for all to authenticated using (public.owns_series(series_id)) with check (public.owns_series(series_id));

-- ─── Episode productions ─────────────────────────────────
alter table public.projects
  add column if not exists series_id uuid references public.series(id) on delete cascade,
  add column if not exists episode_number int;
create index if not exists projects_series_idx on public.projects(series_id, episode_number) where series_id is not null;

alter table public.projects drop constraint projects_kind_check;
alter table public.projects add constraint projects_kind_check check (kind in (
  'film', 'short_film', 'series', 'trailer', 'social_short', 'advert', 'story', 'motion_comic', 'episode'));

alter table public.projects drop constraint projects_episodes_check;
alter table public.projects add constraint projects_episodes_check check (
  (kind = 'series' and episodes is not null and episodes between 1 and 5) or (kind <> 'series' and episodes is null));

alter table public.projects add constraint projects_episode_of_show check (
  (kind = 'episode') = (series_id is not null)
  and (kind = 'episode') = (episode_number is not null)
  and (episode_number is null or episode_number between 1 and 500));

-- An episode belongs to its owner's show, never someone else's.
create or replace function public.projects_episode_show_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.series_id is not null and not exists (
    select 1 from series s join projects p on p.id = s.project_id
    where s.id = new.series_id and p.user_id = new.user_id
  ) then
    raise exception 'an episode belongs to one of its owner''s shows' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.projects_episode_show_owner() from public;

create trigger projects_episode_show_owner before insert or update of series_id, user_id on public.projects
  for each row execute function public.projects_episode_show_owner();

alter table public.episodes
  add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists episodes_project_idx on public.episodes(project_id);
