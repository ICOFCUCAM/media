-- Cineforge — schema part 14: per-language film variants (docs/29 dubbing).
-- locales[lang] = { mp4, voice, subtitle }. Applied live as "films_locales".
alter table public.films add column if not exists locales jsonb;
