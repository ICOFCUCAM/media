-- Cineforge — schema part 62: the Film Bible edited in the workspace
-- (DirectorOS W27; Part 2 §90–92).
--
--  edit_requests.change  takes kind 'film_bible' (logline, synopsis, tone,
--                        themes, premise, the look, the sound). The worker
--                        applies it through the canon revision path like any
--                        other change; only the shots it changes regenerate.

alter table public.edit_requests drop constraint if exists edit_requests_change_check;
alter table public.edit_requests add constraint edit_requests_change_check check (
  jsonb_typeof(change) = 'object'
  and change ->> 'kind' in ('scene_wardrobe', 'wardrobe_description', 'identity', 'physical', 'location', 'prop', 'scene_revision', 'film_bible')
  and length(change::text) <= 12000);
