-- Cineforge — schema part 57: multi-department scene revisions (DirectorOS
-- W25; Part 1 §45 "make scene 7 darker": tone → cinematography → lighting →
-- music → dialogue).
--
--  edit_requests.change  takes kind 'scene_revision' (one scene's emotional
--                        arc, lighting and camera per shot, music cue,
--                        ambience and lines). Such a change is larger than a
--                        wardrobe swap, so the size cap rises to 12000.

alter table public.edit_requests drop constraint if exists edit_requests_change_check;
alter table public.edit_requests add constraint edit_requests_change_check check (
  jsonb_typeof(change) = 'object'
  and change ->> 'kind' in ('scene_wardrobe', 'wardrobe_description', 'identity', 'physical', 'location', 'prop', 'scene_revision')
  and length(change::text) <= 12000);
