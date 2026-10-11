-- Cineforge — schema part 64: plans written outside the AI Director, and
-- homepage slots for showcase films (docs/76).
--
--  projects.supplied_plan     a complete Film IR package written elsewhere (an
--                             operator, a script, an API client). When set,
--                             the worker validates it with the same validator
--                             chain as a Director plan and uses it instead of
--                             calling the Director. Nothing is invented: an
--                             invalid package fails the film with its issues.
--  projects.supplied_plan_by  who wrote it (free text, recorded as the plan's
--                             provider in the decision log).
--  projects.showcase_slot     the homepage slot a film is made for (hero,
--                             work-1 … work-6). Admin-only: the finished film
--                             waits on /admin/showcase until an admin replaces
--                             that slot with it.
--  showcase.slot              the homepage slot a featured film fills. At most
--                             one film per slot; rows without a slot fill the
--                             remaining frames as before.

alter table public.projects
  add column if not exists supplied_plan    jsonb check (supplied_plan is null or jsonb_typeof(supplied_plan) = 'object'),
  add column if not exists supplied_plan_by text  check (supplied_plan_by is null or length(supplied_plan_by) between 1 and 120),
  add column if not exists showcase_slot    text  check (showcase_slot is null or showcase_slot in ('hero', 'work-1', 'work-2', 'work-3', 'work-4', 'work-5', 'work-6'));

alter table public.showcase
  add column if not exists slot text check (slot is null or slot in ('hero', 'work-1', 'work-2', 'work-3', 'work-4', 'work-5', 'work-6'));

create unique index if not exists showcase_slot_key on public.showcase (slot) where slot is not null;

-- Only an admin (or the service role, which has no auth.uid()) marks a film
-- for a homepage slot; an ordinary user's insert or update cannot.
create or replace function public.projects_showcase_slot_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.showcase_slot is not null
     and new.showcase_slot is distinct from (case when tg_op = 'UPDATE' then old.showcase_slot end)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'only an admin can mark a film for a homepage slot' using errcode = '42501';
  end if;
  return new;
end $fn$;

drop trigger if exists projects_showcase_slot_guard on public.projects;
create trigger projects_showcase_slot_guard before insert or update of showcase_slot on public.projects
  for each row execute function public.projects_showcase_slot_guard();
