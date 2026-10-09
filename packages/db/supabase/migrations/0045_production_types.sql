-- Cineforge — schema part 45: production types (DirectorOS W11; Part 5
-- §177–186). What is being made is data on the project, read by the
-- Director and the prompt compilers — not words folded into the brief.
--
--  kind             film · short_film · series · trailer · social_short ·
--                   advert · story · motion_comic
--  medium           live_action · animation
--  animation_style  the animation look (null for live action)
--  episodes         a series' episode count (null otherwise)
--
-- The rules here mirror packages/shared/src/production.ts productionIssues():
-- animation has a style and live action has none; a motion comic is the
-- motion-comic style; only a series has episodes (1–52).

alter table public.projects
  add column if not exists kind text not null default 'film',
  add column if not exists medium text not null default 'live_action',
  add column if not exists animation_style text,
  add column if not exists episodes int;

alter table public.projects
  add constraint projects_kind_check check (kind in ('film', 'short_film', 'series', 'trailer', 'social_short', 'advert', 'story', 'motion_comic')),
  add constraint projects_medium_check check (medium in ('live_action', 'animation')),
  add constraint projects_animation_style_check check (animation_style is null or animation_style in (
    '2d_traditional', '2d_tv', 'anime', 'comic_book', 'childrens_illustration',
    '3d_stylized', '3d_toy', '3d_family', '3d_cinematic', 'low_poly', 'storybook', 'motion_comic')),
  add constraint projects_style_matches_medium check ((medium = 'animation') = (animation_style is not null)),
  add constraint projects_motion_comic_style check (kind <> 'motion_comic' or animation_style = 'motion_comic'),
  add constraint projects_episodes_check check (
    (kind = 'series' and episodes is not null and episodes between 1 and 52) or (kind <> 'series' and episodes is null));
