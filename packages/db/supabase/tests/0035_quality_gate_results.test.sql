-- Validation for migration 0035 (after stubs, 0026–0034).
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
  ('00000000-0000-0000-0000-0000000035a1', '00000000-0000-0000-0000-0000000035aa'),
  ('00000000-0000-0000-0000-0000000035b1', '00000000-0000-0000-0000-0000000035bb');

insert into public.quality_gate_results (project_id, scope, ref_id, gate, outcome, findings, attempt) values
  ('00000000-0000-0000-0000-0000000035a1', 'shot', 'shot-1', 'technical', 'fail', '[{"code":"CLIP_BLACK","severity":"fail"}]', 1),
  ('00000000-0000-0000-0000-0000000035a1', 'shot', 'shot-1', 'technical', 'pass', '[]', 2),
  ('00000000-0000-0000-0000-0000000035a1', 'film', 'film', 'editorial', 'skipped', '[]', 1),
  ('00000000-0000-0000-0000-0000000035b1', 'film', 'film', 'audio', 'warn', '[{"code":"LOUDNESS_OFF_TARGET"}]', 1);

-- Shape checks.
select pg_temp.expect_error($$insert into public.quality_gate_results (project_id, scope, ref_id, gate, outcome)
  values ('00000000-0000-0000-0000-0000000035a1', 'scene', 'x', 'technical', 'pass')$$, '23514');
select pg_temp.expect_error($$insert into public.quality_gate_results (project_id, scope, ref_id, gate, outcome)
  values ('00000000-0000-0000-0000-0000000035a1', 'shot', 'x', 'vibes', 'pass')$$, '23514');
select pg_temp.expect_error($$insert into public.quality_gate_results (project_id, scope, ref_id, gate, outcome)
  values ('00000000-0000-0000-0000-0000000035a1', 'shot', 'x', 'technical', 'great')$$, '23514');
select pg_temp.expect_error($$insert into public.quality_gate_results (project_id, scope, ref_id, gate, outcome, findings)
  values ('00000000-0000-0000-0000-0000000035a1', 'shot', 'x', 'technical', 'pass', '{}')$$, '23514');

-- Append-only.
select pg_temp.expect_error($$update public.quality_gate_results set outcome = 'pass'$$, '42501');
select pg_temp.expect_error($$delete from public.quality_gate_results$$, '42501');

-- RLS: owners read their own project's rows only; no client writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000035aa', false);
do $$ begin
  assert (select count(*) from public.quality_gate_results) = 3, 'owner sees only own project';
end $$;
select pg_temp.expect_error($$insert into public.quality_gate_results (project_id, scope, ref_id, gate, outcome)
  values ('00000000-0000-0000-0000-0000000035a1', 'shot', 'x', 'technical', 'pass')$$, '42501');
reset role;

-- Project deletion cascades.
delete from public.projects where id = '00000000-0000-0000-0000-0000000035b1';
do $$ begin
  assert (select count(*) from public.quality_gate_results where project_id = '00000000-0000-0000-0000-0000000035b1') = 0, 'cascade';
end $$;

\echo 0035 quality gate results: ok
