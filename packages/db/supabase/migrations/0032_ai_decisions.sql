-- Cineforge — schema part 32: the AI decision log (DirectorOS W2; DOS-48, DOS-49).
--
--  ai_decisions  one row per call to a reasoning model: which task, which
--                prompt (registry id + version), which provider and model
--                answered, hashes of what was asked and what came back, the
--                outcome (ok / invalid / error + code), validation issue count,
--                tokens and latency. Prompts and outputs are not stored here
--                (the plan itself lives in screenplays.raw); the hashes tie a
--                decision to them. Every attempt of a routed call is a row, so
--                a fallback to another provider is visible, never silent.
--
-- Written by the worker (service role); append-only; owners read their
-- project's rows, admins read all.

create table public.ai_decisions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references public.projects (id) on delete cascade,
  task           text not null check (task ~ '^[a-z][a-z0-9_]{1,40}$'),
  prompt_id      text not null check (length(prompt_id) between 1 and 80),
  prompt_version int not null check (prompt_version >= 1),
  schema_name    text not null,
  provider       text,
  model          text,
  attempt        int not null default 0 check (attempt >= 0),
  input_sha256   text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256  text check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  outcome        text not null check (outcome in ('ok', 'invalid', 'error')),
  error_code     text,
  issues         int not null default 0 check (issues >= 0),
  input_tokens   int check (input_tokens is null or input_tokens >= 0),
  output_tokens  int check (output_tokens is null or output_tokens >= 0),
  latency_ms     int check (latency_ms is null or latency_ms >= 0),
  created_at     timestamptz not null default now(),
  constraint ai_decisions_error_code check ((outcome = 'error') = (error_code is not null))
);
create index ai_decisions_project_idx on public.ai_decisions (project_id, created_at);
create index ai_decisions_task_idx on public.ai_decisions (task, created_at);

create or replace function public.ai_decisions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.project_id is not null
     and not exists (select 1 from public.projects where id = old.project_id) then
    return old;  -- project deletion cascades
  end if;
  raise exception 'the AI decision log is append-only' using errcode = '42501';
end;
$$;
create trigger ai_decisions_append_only before update or delete on public.ai_decisions
  for each row execute function public.ai_decisions_append_only();

alter table public.ai_decisions enable row level security;
create policy ai_decisions_owner_read on public.ai_decisions
  for select to authenticated using (
    (project_id is not null and (select public.owns_project(project_id))) or (select public.is_admin()));
revoke all on public.ai_decisions from anon;
revoke insert, update, delete on public.ai_decisions from authenticated;
