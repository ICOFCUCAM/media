-- Cineforge — schema part 47: the show container (DirectorOS W12; Part 5 §184).
--
-- A show made episode by episode is a series project with mode 'show': it
-- holds the series row, the Show Bible and the show's cast, is never queued
-- (it stays DRAFT; only its episode productions are made), and has no
-- one-pass episode count. A series planned in one pass still has 1–5.

alter table public.projects drop constraint projects_episodes_check;
alter table public.projects add constraint projects_episodes_check check (
  (kind = 'series' and mode = 'show' and episodes is null)
  or (kind = 'series' and mode <> 'show' and episodes is not null and episodes between 1 and 5)
  or (kind <> 'series' and episodes is null));

-- A show container is a series and is never made itself.
alter table public.projects add constraint projects_show_container check (
  mode <> 'show' or (kind = 'series' and status = 'DRAFT'));

-- 0046's trigger function is not an API: Supabase grants EXECUTE on new
-- functions to anon and authenticated explicitly, so revoke from both
-- (a trigger fires regardless of the caller's EXECUTE privilege).
revoke execute on function public.projects_episode_show_owner() from anon, authenticated;
