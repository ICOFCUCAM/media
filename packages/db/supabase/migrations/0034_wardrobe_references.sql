-- Cineforge — schema part 34: wardrobe reference pack (DirectorOS W3 follow-up; DOS-62.9).
--
--  wardrobe_references  one reference still per (character, wardrobe entry,
--                       canon digest): the character's canonical identity
--                       wearing that wardrobe in the film's look. The digest
--                       hashes exactly the canon the image depicts, so a canon
--                       change (coat, hair, look) needs a new row — old rows
--                       stay as history and are never rewritten.
--
-- Written by the worker (service role); append-only; owners read their
-- project's rows, admins read all.

create table public.wardrobe_references (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  character_id  uuid not null references public.characters (id) on delete cascade,
  wardrobe_key  text not null check (wardrobe_key ~ '^wardrobe_[a-z0-9][a-z0-9_]{0,47}$'),
  digest        text not null check (digest ~ '^[0-9a-f]{64}$'),
  storage_key   text not null check (length(storage_key) between 1 and 512),
  provider      text not null,
  created_at    timestamptz not null default now(),
  unique (character_id, wardrobe_key, digest)
);
create index wardrobe_references_project_idx on public.wardrobe_references (project_id);

create or replace function public.wardrobe_references_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (not exists (select 1 from public.projects where id = old.project_id)
                           or not exists (select 1 from public.characters where id = old.character_id)) then
    return old;  -- project or character deletion cascades
  end if;
  raise exception 'wardrobe references are append-only' using errcode = '42501';
end;
$$;
create trigger wardrobe_references_append_only before update or delete on public.wardrobe_references
  for each row execute function public.wardrobe_references_append_only();

alter table public.wardrobe_references enable row level security;
create policy wardrobe_references_owner_read on public.wardrobe_references
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
revoke all on public.wardrobe_references from anon;
revoke insert, update, delete on public.wardrobe_references from authenticated;
