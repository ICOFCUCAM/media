-- Cineforge — schema part 9: the Continuity Engine.
-- Each scene stores its Scene Bridge, the state changes it makes (state_patch),
-- its dependencies, and a cached continuity score. The running Project Memory
-- Graph is *derived* by folding state_patch over scenes in index order (see
-- packages/shared/src/continuity.ts and docs/28-continuity-engine.md).
alter table public.scenes add column if not exists bridge jsonb;
alter table public.scenes add column if not exists state_patch jsonb;
alter table public.scenes add column if not exists depends_on integer[] not null default '{}';
alter table public.scenes add column if not exists continuity_score integer;

comment on column public.scenes.bridge is 'Scene Bridge: { whatJustHappened, whatChanged, whatCarriesForward, nextSceneRequirements }';
comment on column public.scenes.state_patch is 'What this scene changes: { characters, relationships, locations, world, goals }';
comment on column public.scenes.depends_on is 'scene indexes this scene depends on (defaults to the previous scene)';
comment on column public.scenes.continuity_score is 'cached 0..100 continuity score for the storyboard card';
