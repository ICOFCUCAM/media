-- Cineforge — schema part 23: per-project output format (docs/33), chosen at
-- create time and plan-classified. Applied live as "project_resolution".
alter table public.projects add column if not exists resolution text not null default '720p';
