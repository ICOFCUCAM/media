-- Validation for migration 0043 (after stubs, 0026–0042).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Benchmark runs: a prompt score names its version; scores are 0..1.
insert into public.benchmark_runs (suite, status, score, prompt_id, prompt_version, model, git_sha, metrics)
  values ('live_planning', 'pass', 0.8125, 'director.master', 4, 'claude-opus-5-5', 'abc1234', '{"validRate": 1}');
insert into public.benchmark_runs (suite, status, score) values ('offline', 'pass', 1);
select pg_temp.expect_error($$insert into public.benchmark_runs (suite, status, score) values ('offline', 'pass', 1.5)$$, '23514');
select pg_temp.expect_error($$insert into public.benchmark_runs (suite, status, prompt_id) values ('live_planning', 'pass', 'director.master')$$, '23514');
select pg_temp.expect_error($$insert into public.benchmark_runs (suite, status) values ('vibes', 'pass')$$, '23514');
select pg_temp.expect_error($$insert into public.benchmark_runs (suite, status, git_sha) values ('offline', 'pass', 'main')$$, '23514');
select pg_temp.expect_error($$update public.benchmark_runs set score = 1$$, '42501');
select pg_temp.expect_error($$delete from public.benchmark_runs$$, '42501');

-- Acceptance: a PASS needs sixteen passed checks.
create temp table sixteen as
  select jsonb_agg(jsonb_build_object('id', 'check_' || i, 'passed', true)) as checks from generate_series(1, 16) i;
insert into public.acceptance_runs (brief, target_sec, verdict, checks, started_at)
  select 'A woman at an abandoned railway station at night.', 180, 'PASS', checks, now() - interval '1 hour' from sixteen;
insert into public.acceptance_runs (brief, target_sec, verdict, checks, started_at)
  values ('Same brief.', 180, 'FAIL', '[{"id": "file_exists", "passed": false}]', now() - interval '1 hour');
select pg_temp.expect_error($$insert into public.acceptance_runs (brief, target_sec, verdict, checks, started_at)
  values ('x', 180, 'PASS', '[{"id": "file_exists", "passed": true}]', now())$$, '23514');
select pg_temp.expect_error($$insert into public.acceptance_runs (brief, target_sec, verdict, checks, started_at)
  select 'x', 180, 'PASS', jsonb_set(checks, '{3,passed}', 'false'), now() from sixteen$$, '23514');
select pg_temp.expect_error($$insert into public.acceptance_runs (brief, target_sec, verdict, checks, started_at)
  values ('x', 180, 'FAIL', '{}', now())$$, '23514');
select pg_temp.expect_error($$update public.acceptance_runs set verdict = 'PASS'$$, '42501');

-- Only admins read; nobody but the worker writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000043aa', false);
do $$ begin
  if (select count(*) from public.benchmark_runs) <> 0 or (select count(*) from public.acceptance_runs) <> 0 then
    raise exception 'a non-admin can read evaluation evidence';
  end if;
end $$;
select pg_temp.expect_error($$insert into public.benchmark_runs (suite, status) values ('offline', 'pass')$$, '42501');
reset role;

select 'ok 0043' as result;
