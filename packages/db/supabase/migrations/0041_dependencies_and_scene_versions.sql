-- Cineforge — schema part 41: dependency edges and scene versions (DirectorOS W8b; Part 2 §62, §89).
--
--  shot_dependencies  which canon entities each planned shot depends on
--                     (character, wardrobe, location, prop — by Film IR key),
--                     written when the film is compiled and when a canon edit
--                     recompiles a shot. "What does changing this touch?" is a
--                     query, and invalidation regenerates only those shots.
--  scene_versions     a snapshot of a scene (its plan, shots, clip pointers,
--                     dialogue) taken before a re-plan replaces it or a canon
--                     edit changes it. Append-only: nothing a scene was is
--                     ever lost.
--
-- Written by the worker (service role); owners read their own.

create table public.shot_dependencies (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  shot_id       uuid not null references public.shots (id) on delete cascade,
  entity_type   text not null check (entity_type in ('character', 'wardrobe', 'location', 'prop')),
  entity_key    text not null check (length(entity_key) between 1 and 128),
  canon_version text check (canon_version is null or length(canon_version) <= 64),
  created_at    timestamptz not null default now(),
  unique (shot_id, entity_type, entity_key)
);
create index shot_dependencies_entity_idx on public.shot_dependencies (project_id, entity_type, entity_key);

alter table public.shot_dependencies enable row level security;
create policy shot_dependencies_owner_read on public.shot_dependencies
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
revoke all on public.shot_dependencies from anon;
revoke insert, update, delete on public.shot_dependencies from authenticated;

create table public.scene_versions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  scene_id       uuid not null,             -- the scene as it was (it may since be replaced)
  scene_index    int not null check (scene_index >= 0),
  reason         text not null check (reason in ('replan', 'canon_edit')),
  canon_version  text check (canon_version is null or length(canon_version) <= 64),
  snapshot       jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at     timestamptz not null default now()
);
create index scene_versions_project_idx on public.scene_versions (project_id, scene_index, created_at);

create or replace function public.scene_versions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;  -- project deletion cascades
  end if;
  raise exception 'scene versions are append-only' using errcode = '42501';
end;
$$;
create trigger scene_versions_append_only before update or delete on public.scene_versions
  for each row execute function public.scene_versions_append_only();

alter table public.scene_versions enable row level security;
create policy scene_versions_owner_read on public.scene_versions
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
revoke all on public.scene_versions from anon;
revoke insert, update, delete on public.scene_versions from authenticated;
