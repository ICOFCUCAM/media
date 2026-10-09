-- Validation for migration 0042 (after stubs, 0026–0041).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Decision summaries.
insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome, summary)
  values ('film_plan', 'director.master', 4, 'film_package', repeat('a', 64), 'ok', 'Planned 6 scenes with 3 characters.');
select pg_temp.expect_error($$insert into public.ai_decisions (task, prompt_id, prompt_version, schema_name, input_sha256, outcome, summary)
  values ('film_plan', 'director.master', 4, 'film_package', repeat('a', 64), 'ok', repeat('x', 501))$$, '23514');

insert into public.projects (id, user_id) values
  ('00000000-0000-0000-0000-0000000042a1', '00000000-0000-0000-0000-0000000042aa'),
  ('00000000-0000-0000-0000-0000000042b1', '00000000-0000-0000-0000-0000000042bb');

-- The owner writes instructions to their own film, as themselves.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000042aa', false);
insert into public.director_messages (id, project_id, author, user_id, body) values
  ('00000000-0000-0000-0000-00000042e001', '00000000-0000-0000-0000-0000000042a1', 'owner', '00000000-0000-0000-0000-0000000042aa', 'Make Maya''s coat red from the harbour on.');
select pg_temp.expect_error($$insert into public.director_messages (project_id, author, user_id, body) values ('00000000-0000-0000-0000-0000000042b1', 'owner', '00000000-0000-0000-0000-0000000042aa', 'hi')$$, '42501');
select pg_temp.expect_error($$insert into public.director_messages (project_id, author, user_id, body) values ('00000000-0000-0000-0000-0000000042a1', 'director', '00000000-0000-0000-0000-0000000042aa', 'I did it')$$, '42501');
select pg_temp.expect_error($$insert into public.director_messages (project_id, author, user_id, body, status) values ('00000000-0000-0000-0000-0000000042a1', 'owner', '00000000-0000-0000-0000-0000000042aa', 'x', 'answered')$$, '42501');
select pg_temp.expect_error($$update public.director_messages set status = 'answered'$$, '42501');
reset role;

-- Shape.
select pg_temp.expect_error($$insert into public.director_messages (project_id, author, body) values ('00000000-0000-0000-0000-0000000042a1', 'owner', '')$$, '23514');

-- The worker answers once; the text never changes.
insert into public.director_messages (project_id, author, body, status, reply_to) values
  ('00000000-0000-0000-0000-0000000042a1', 'director', 'Changing Maya''s coat to red from scene 3 on — 4 shots will regenerate.', 'answered', '00000000-0000-0000-0000-00000042e001');
update public.director_messages set status = 'answered' where id = '00000000-0000-0000-0000-00000042e001';
select pg_temp.expect_error($$update public.director_messages set status = 'failed' where id = '00000000-0000-0000-0000-00000042e001'$$, '42501');
select pg_temp.expect_error($$update public.director_messages set body = 'edited' where id = '00000000-0000-0000-0000-00000042e001'$$, '42501');

-- The owner reads the conversation; others do not.
set role authenticated;
do $$ begin
  assert (select count(*) from public.director_messages) = 2, 'owner reads both sides';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000042bb', false);
do $$ begin
  assert (select count(*) from public.director_messages) = 0, 'others read nothing';
end $$;
reset role;

delete from public.projects where id in ('00000000-0000-0000-0000-0000000042a1', '00000000-0000-0000-0000-0000000042b1');
do $$ begin
  assert (select count(*) from public.director_messages) = 0, 'cascade';
end $$;
\echo 0042 director workspace: ok
