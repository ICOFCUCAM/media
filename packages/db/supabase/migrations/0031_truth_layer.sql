-- Cineforge — schema part 31: the truth layer (DirectorOS W1; DOS-73, 75, 77, 78).
--
--  production_degradations  every gap a production ran with — a capability it
--                           asked for and did not get (clamped output, ignored
--                           reference, skipped LoRA, missing track, failed
--                           upscale or translation). Written by the worker,
--                           append-only, readable by the project owner so the
--                           UI can show it. Gaps that would make a result false
--                           are failures, not rows here (the job stops).
--  system_capabilities      what is actually operational now, computed by the
--                           worker from configuration and probes (never
--                           hand-written). The UI offers only what is real.
--
-- Server-side writes only (service role); owners read their degradations;
-- signed-in users read capabilities.

create table public.production_degradations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  code        text not null check (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  severity    text not null check (severity in ('info', 'warning', 'major')),
  scope       text not null check (scope in ('project', 'scene', 'shot', 'film', 'locale')),
  ref_id      text check (ref_id is null or length(ref_id) <= 128),
  message     text not null check (length(message) between 1 and 500),
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index production_degradations_project_idx on public.production_degradations (project_id, created_at);

-- A recorded gap is history: it is never edited or erased by the application.
create or replace function public.production_degradations_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;  -- project deletion cascades
  end if;
  raise exception 'production degradations are append-only' using errcode = '42501';
end;
$$;
create trigger production_degradations_append_only before update or delete on public.production_degradations
  for each row execute function public.production_degradations_append_only();

create table public.system_capabilities (
  capability     text primary key check (capability ~ '^[a-z][a-z0-9_]{2,63}$'),
  provider       text,
  status         text not null check (status in ('production_ready', 'experimental', 'unavailable', 'disabled', 'not_implemented')),
  real_execution boolean not null,
  requires_gpu   boolean not null default false,
  supports       text[] not null default '{}',
  note           text check (note is null or length(note) <= 300),
  reported_by    text not null,
  updated_at     timestamptz not null default now(),
  -- Nothing unreal is offered as working.
  constraint system_capabilities_real check (real_execution or status in ('unavailable', 'disabled', 'not_implemented'))
);

alter table public.production_degradations enable row level security;
alter table public.system_capabilities enable row level security;

create policy production_degradations_owner_read on public.production_degradations
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy system_capabilities_read on public.system_capabilities
  for select to authenticated using (true);

revoke all on public.production_degradations, public.system_capabilities from anon;
revoke insert, update, delete on public.production_degradations, public.system_capabilities from authenticated;
