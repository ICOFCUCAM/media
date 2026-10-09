-- Cineforge — schema part 43: evaluation and acceptance (DirectorOS W10;
-- Part 1 §50, Part 2 §76, §81).
--
--  benchmark_runs   one row per benchmark run: the offline engine benchmark
--                   (corpus + labelled cases), the live planning benchmark
--                   (its score is the evaluation score of the prompt version
--                   it ran, DOS-49.2), the real-provider probes and the sync
--                   instrument calibration. Metrics and per-case results are
--                   kept as written.
--  acceptance_runs  one row per end-to-end film acceptance run (Part 2 §81):
--                   the brief, the project it produced, each of the 16
--                   checks with its evidence, and the verdict. Only a PASS
--                   row lets anyone report END_TO_END_MOVIE_PIPELINE: PASS.
--
-- Both are evidence: append-only, written by the worker (service role), read
-- by admins. acceptance_runs keeps project_id without a foreign key so the
-- evidence outlives the film.

create table public.benchmark_runs (
  id              uuid primary key default gen_random_uuid(),
  suite           text not null check (suite in ('offline', 'live_planning', 'providers', 'sync_calibration')),
  status          text not null check (status in ('pass', 'fail', 'incomplete')),
  score           numeric(6, 4) check (score is null or (score >= 0 and score <= 1)),
  prompt_id       text,
  prompt_version  int check (prompt_version is null or prompt_version >= 1),
  provider        text,
  model           text,
  git_sha         text check (git_sha is null or git_sha ~ '^[0-9a-f]{7,40}$'),
  metrics         jsonb not null default '{}',
  cases           jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  check ((prompt_id is null) = (prompt_version is null))
);
create index benchmark_runs_suite_idx on public.benchmark_runs (suite, created_at desc);
create index benchmark_runs_prompt_idx on public.benchmark_runs (prompt_id, prompt_version, created_at desc) where prompt_id is not null;

create table public.acceptance_runs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid,
  brief        text not null check (length(brief) between 1 and 2000),
  target_sec   int not null check (target_sec > 0),
  verdict      text not null check (verdict in ('PASS', 'FAIL')),
  checks       jsonb not null check (jsonb_typeof(checks) = 'array'),
  master_key   text,
  git_sha      text check (git_sha is null or git_sha ~ '^[0-9a-f]{7,40}$'),
  started_at   timestamptz not null,
  finished_at  timestamptz not null default now(),
  check (finished_at >= started_at),
  -- A PASS needs all sixteen checks, every one passed.
  check (verdict = 'FAIL' or (jsonb_array_length(checks) = 16
         and not jsonb_path_exists(checks, '$[*] ? (@.passed != true)')))
);
create index acceptance_runs_finished_idx on public.acceptance_runs (finished_at desc);

create or replace function public.evaluation_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only evidence', tg_table_name using errcode = '42501';
end;
$$;
create trigger benchmark_runs_append_only before update or delete on public.benchmark_runs
  for each row execute function public.evaluation_append_only();
create trigger acceptance_runs_append_only before update or delete on public.acceptance_runs
  for each row execute function public.evaluation_append_only();

alter table public.benchmark_runs enable row level security;
alter table public.acceptance_runs enable row level security;
create policy benchmark_runs_admin_read on public.benchmark_runs for select to authenticated using ((select public.is_admin()));
create policy acceptance_runs_admin_read on public.acceptance_runs for select to authenticated using ((select public.is_admin()));
revoke all on public.benchmark_runs, public.acceptance_runs from anon;
revoke insert, update, delete on public.benchmark_runs, public.acceptance_runs from authenticated;
