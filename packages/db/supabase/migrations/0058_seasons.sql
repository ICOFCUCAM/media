-- Cineforge — schema part 58: further seasons (DirectorOS W26; Part 5 §178
-- "Series → Season 1 → Episodes …, Season 2").
--
--  projects.season_number  the season an episode belongs to (null = season 1;
--                          only episodes have one). Episode numbers run on
--                          across seasons, so order is unchanged: a later
--                          episode is never in an earlier season.

alter table public.projects
  add column if not exists season_number int;
alter table public.projects drop constraint if exists projects_season_of_episode;
alter table public.projects add constraint projects_season_of_episode check (
  season_number is null or (kind = 'episode' and season_number between 1 and 50));

create or replace function public.projects_season_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s int := coalesce(new.season_number, 1);
begin
  if new.series_id is null or new.episode_number is null then return new; end if;
  if exists (
    select 1 from public.projects p
    where p.series_id = new.series_id and p.id <> new.id and p.episode_number is not null
      and ((p.episode_number < new.episode_number and coalesce(p.season_number, 1) > s)
        or (p.episode_number > new.episode_number and coalesce(p.season_number, 1) < s))
  ) then
    raise exception 'episode % cannot be in season %: seasons follow the episode order', new.episode_number, s using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.projects_season_order() from public;

drop trigger if exists projects_season_order on public.projects;
create trigger projects_season_order before insert or update of season_number, episode_number, series_id on public.projects
  for each row execute function public.projects_season_order();
