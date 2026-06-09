-- Cineforge — schema part 8: the scene as a full production object.
-- Per-scene character/world reference + per-shot camera type/movement and an
-- uploaded reference video (motion style). See docs/26-storyboard-mode.md.
alter table public.scenes add column if not exists character_ref text;
alter table public.scenes add column if not exists world_ref text;
alter table public.shots  add column if not exists camera_type text;
alter table public.shots  add column if not exists camera_movement text;
alter table public.shots  add column if not exists reference_video_key text;

comment on column public.scenes.character_ref is 'selected library character (name) anchoring this scene';
comment on column public.scenes.world_ref is 'selected library world (name) anchoring this scene';
comment on column public.shots.reference_video_key is 'storage key of an uploaded reference video (motion style)';
