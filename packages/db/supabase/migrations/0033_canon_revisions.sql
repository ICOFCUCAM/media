-- Cineforge — schema part 33: canon revisions (DirectorOS W3; DOS-62.8–62.9, DOS-92).
--
--  canon_revisions  one row per change to a film's canon after planning (a
--                   wardrobe, identity, injury, location or prop change). The
--                   Film IR itself stays in screenplays.raw; each row records
--                   the canon version before and after (content hashes), the
--                   change as applied, and exactly which scenes and shots it
--                   touched — those shots, and only those, are regenerated.
--                   Rejected changes (they would break canon) are recorded
--                   with their issues and touch nothing.
--
-- Written by the worker (service role); append-only; owners read their
-- project's rows, admins read all.

create table public.canon_revisions (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  kind             text not null check (kind ~ '^[a-z][a-z_]{1,40}$'),
  change           jsonb not null check (jsonb_typeof(change) = 'object'),
  from_version     text not null check (from_version ~ '^[0-9a-f]{16}$'),
  to_version       text not null check (to_version ~ '^[0-9a-f]{16}$'),
  outcome          text not null check (outcome in ('applied', 'rejected')),
  issues           jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  affected_scenes  text[] not null default '{}',
  affected_shots   jsonb not null default '[]' check (jsonb_typeof(affected_shots) = 'array'),
  invalidated      int not null default 0 check (invalidated >= 0),
  actor            text,
  created_at       timestamptz not null default now(),
  constraint canon_revisions_rejected_touches_nothing check (
    outcome = 'applied' or (invalidated = 0 and cardinality(affected_scenes) = 0 and jsonb_array_length(issues) > 0))
);
create index canon_revisions_project_idx on public.canon_revisions (project_id, created_at);

create or replace function public.canon_revisions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;  -- project deletion cascades
  end if;
  raise exception 'canon revisions are append-only' using errcode = '42501';
end;
$$;
create trigger canon_revisions_append_only before update or delete on public.canon_revisions
  for each row execute function public.canon_revisions_append_only();

alter table public.canon_revisions enable row level security;
create policy canon_revisions_owner_read on public.canon_revisions
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
revoke all on public.canon_revisions from anon;
revoke insert, update, delete on public.canon_revisions from authenticated;
