-- Cineforge — schema part 56: the film's look as a reference still (DirectorOS
-- W24; Part 1 §34 "style reference", §35 reference pack).
--
--  world_references  takes kind 'style' (ref_key style_<name>): one still of
--                    the film's look per digest of that look, shared by every
--                    shot of the film and drawn again when the look changes.

alter table public.world_references drop constraint if exists world_references_kind_check;
alter table public.world_references add constraint world_references_kind_check
  check (kind in ('location', 'prop', 'style'));
alter table public.world_references drop constraint if exists world_references_ref_key_check;
alter table public.world_references add constraint world_references_ref_key_check
  check (ref_key ~ '^(loc|prop|style)_[a-z0-9_]{1,60}$');
