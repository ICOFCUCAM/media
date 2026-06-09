-- Cineforge — schema part 10: multilingual export (docs/29).
-- Per-scene map of language code -> subtitle storage key, e.g.
-- { "es": "projects/<id>/subtitles/<sceneId>.es.srt", "fr": "..." }.
alter table public.scenes add column if not exists subtitles jsonb;

comment on column public.scenes.subtitles is 'language code -> subtitle (.srt) storage key for that language';
