-- Validation for migration 0032 (after stubs, 0026–0031).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.projects (id, user_id) values
  ('00000000-0000-0000-0000-0000000032a1', '00000000-0000-0000-0000-0000000032aa'),
  ('00000000-0000-0000-0000-0000000032b1', '00000000-0000-0000-0000-0000000032bb');

insert into public.ai_decisions (project_id, task, prompt_id, prompt_version, schema_name, provider, model, input_sha256, output_sha256, outcome, input_tokens, output_tokens, latency_ms)
values ('00000000-0000-0000-0000-0000000032a1', 'film_plan', 'director.master', 1, 'FilmPackage', 'anthropic', 'claude-opus-5-5',
        repeat('a', 64), repeat('b', 64), 'ok', 1200, 9000, 41000);
insert into public.ai_decisions (project_id, task, prompt_id, prompt_version, schema_name, provider, model, attempt, input_sha256, outcome, error_code)
values ('00000000-0000-0000-0000-0000000032b1', 'film_plan', 'director.master', 1, 'FilmPackage', 'anthropic', 'claude-opus-5-5', 0,
        repeat('c', 64), 'error', 'REFUSED');
-- A decision without a project (e.g. a system task) is allowed.
insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome)
values ('translation', 'translate.lines', 1, 'Translation', repeat('d', 64), 'ok');

-- Shape checks.
select pg_temp.expect_error($$insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome)
  values ('film_plan', 'p', 1, 'S', 'not-a-hash', 'ok')$$, '23514');
select pg_temp.expect_error($$insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome)
  values ('film_plan', 'p', 1, 'S', repeat('a', 64), 'error')$$, '23514');  -- error needs a code
select pg_temp.expect_error($$insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome, error_code)
  values ('film_plan', 'p', 1, 'S', repeat('a', 64), 'ok', 'X')$$, '23514');  -- ok has no code

-- Append-only.
select pg_temp.expect_error($$update public.ai_decisions set model = 'x'$$, '42501');
select pg_temp.expect_error($$delete from public.ai_decisions where project_id is null$$, '42501');

-- RLS: owners read their own project's decisions only; no client writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000032aa', false);
do $$ begin
  assert (select count(*) from public.ai_decisions) = 1, 'owner sees only own project';
end $$;
select pg_temp.expect_error($$insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome)
  values ('film_plan', 'p', 1, 'S', repeat('a', 64), 'ok')$$, '42501');
reset role;

-- Project deletion cascades.
delete from public.projects where id = '00000000-0000-0000-0000-0000000032b1';
do $$ begin
  assert (select count(*) from public.ai_decisions where project_id = '00000000-0000-0000-0000-0000000032b1') = 0, 'cascade';
end $$;

\echo 0032 ai decisions: ok
