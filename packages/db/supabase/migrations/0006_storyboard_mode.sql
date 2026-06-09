-- Cineforge — Supabase schema, part 6: storyboard (scene-by-scene) authoring.
-- Adds the per-project authoring mode and the per-shot seed frame + source flag
-- that power image-to-video. See docs/26-storyboard-mode.md.
alter table public.projects add column if not exists mode text not null default 'auto';
alter table public.shots    add column if not exists seed_image_key text;
alter table public.shots    add column if not exists source text not null default 'text';

comment on column public.projects.mode is 'auto = one prompt -> whole film; storyboard = per-scene authoring';
comment on column public.shots.seed_image_key is 'storage key of the seed frame for image-to-video; null for text-to-video';
comment on column public.shots.source is 'text = text-to-video; image = image-to-video (uses seed_image_key)';
