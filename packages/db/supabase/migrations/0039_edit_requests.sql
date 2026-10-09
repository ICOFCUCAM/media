-- Cineforge — schema part 39: edit requests (DirectorOS W8b; Part 2 §62.9).
--
--  edit_requests  an owner asks for one canon change to a planned film
--                 (an outfit from a scene on, an outfit everywhere, a visible
--                 injury, identity, a location or a prop). The worker applies
--                 it through the canon revision path: only the shots it
--                 touches regenerate, and a change that breaks canon or
--                 touches a locked scene is refused with the reasons.
--
-- Owners insert pending requests and read their own; only the worker
-- (service role) moves them on. pending → applying → applied | rejected |
-- failed; finished requests are final.

create table public.edit_requests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  requested_by    uuid,                    -- the owner who asked (the insert policy requires it to be them)
  change          jsonb not null check (
                    jsonb_typeof(change) = 'object'
                    and change ->> 'kind' in ('scene_wardrobe', 'wardrobe_description', 'identity', 'physical', 'location', 'prop')
                    and length(change::text) <= 4000),
  status          text not null default 'pending' check (status in ('pending', 'applying', 'applied', 'rejected', 'failed')),
  issues          jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  affected_shots  int check (affected_shots is null or affected_shots >= 0),
  to_version      text check (to_version is null or length(to_version) <= 64),
  error           text check (error is null or length(error) <= 1000),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index edit_requests_project_idx on public.edit_requests (project_id, created_at);
create index edit_requests_pending_idx on public.edit_requests (status) where status = 'pending';

create or replace function public.edit_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id or new.change <> old.change or new.requested_by is distinct from old.requested_by then
    raise exception 'an edit request keeps its project, change and requester' using errcode = '42501';
  end if;
  if old.status in ('applied', 'rejected', 'failed') and new.status <> old.status then
    raise exception 'edit request % is %; finished requests are final', old.id, old.status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger edit_requests_guard before update on public.edit_requests
  for each row execute function public.edit_requests_guard();

alter table public.edit_requests enable row level security;
create policy edit_requests_owner_read on public.edit_requests
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy edit_requests_owner_insert on public.edit_requests
  for insert to authenticated
  with check ((select public.owns_project(project_id)) and status = 'pending' and requested_by = (select auth.uid())
              and issues = '[]'::jsonb and affected_shots is null and to_version is null and error is null and finished_at is null);
revoke all on public.edit_requests from anon;
revoke update, delete on public.edit_requests from authenticated;
