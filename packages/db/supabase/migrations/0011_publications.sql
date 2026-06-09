-- Cineforge — schema part 11: social publishing (docs/31).
-- Per-film map of provider -> publish result, e.g.
-- { "youtube": { "status": "published", "id": "abc", "url": "https://youtu.be/abc" } }.
alter table public.films add column if not exists publications jsonb;

comment on column public.films.publications is 'social provider -> publish result { status, id?, url?, detail? }';
