-- Cineforge — schema part 35: quality gate results (DirectorOS W5; DOS-39, DOS-40, DOS-70).
--
--  quality_gate_results  one row per gate run: which gate (story, visual,
--                        continuity, audio, technical, editorial), on what
--                        (a shot or the film), with which outcome (pass, warn,
--                        fail, skipped) and the findings behind it. A shot is
--                        READY and a film is delivered only after their gates
--                        have run; a regenerated shot adds rows (attempt n),
--                        never rewrites old ones.
--
-- Written by the worker (service role); append-only; owners read their
-- project's rows, admins read all.

create table public.quality_gate_results (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  scope       text not null check (scope in ('shot', 'film')),
  ref_id      text not null check (length(ref_id) between 1 and 128),
  gate        text not null check (gate in ('story', 'visual', 'continuity', 'audio', 'technical', 'editorial')),
  outcome     text not null check (outcome in ('pass', 'warn', 'fail', 'skipped')),
  findings    jsonb not null default '[]' check (jsonb_typeof(findings) = 'array'),
  attempt     int not null default 1 check (attempt >= 1),
  created_at  timestamptz not null default now()
);
create index quality_gate_results_project_idx on public.quality_gate_results (project_id, created_at);
create index quality_gate_results_ref_idx on public.quality_gate_results (scope, ref_id);

create or replace function public.quality_gate_results_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;  -- project deletion cascades
  end if;
  raise exception 'quality gate results are append-only' using errcode = '42501';
end;
$$;
create trigger quality_gate_results_append_only before update or delete on public.quality_gate_results
  for each row execute function public.quality_gate_results_append_only();

alter table public.quality_gate_results enable row level security;
create policy quality_gate_results_owner_read on public.quality_gate_results
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
revoke all on public.quality_gate_results from anon;
revoke insert, update, delete on public.quality_gate_results from authenticated;
