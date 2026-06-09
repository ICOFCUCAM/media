-- Cineforge — schema part 7: Scene Workbench depth + Visual Asset Studio.
-- Each scene becomes a rich, independently editable object (dialogue, narration,
-- camera, mood, music, location note). world_objects gain a category so props,
-- vehicles, creatures, logos and brands are first-class reusable assets.
alter table public.scenes add column if not exists dialogue text;
alter table public.scenes add column if not exists narration text;
alter table public.scenes add column if not exists camera text;
alter table public.scenes add column if not exists mood text;
alter table public.scenes add column if not exists music text;
alter table public.scenes add column if not exists location_note text;

alter table public.world_objects add column if not exists category text not null default 'object';

comment on column public.world_objects.category is 'prop | vehicle | creature | logo | brand | object';
