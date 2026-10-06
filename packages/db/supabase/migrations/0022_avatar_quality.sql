-- Cineforge — schema part 22: avatar quality tiers + 4K master key.
-- Applied live as "avatar_quality".
-- Standard (SadTalker) vs premium (Kling AI Avatar).
alter table public.avatar_videos add column if not exists quality text not null default 'standard';
-- 4K upscale export (docs/33, Studio+): key of the upscaled master.
alter table public.films add column if not exists mp4_4k_key text;
