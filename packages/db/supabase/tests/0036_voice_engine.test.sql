-- Validation for migration 0036 (after stubs, 0026–0035).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values
  ('00000000-0000-0000-0000-0000000036aa'),
  ('00000000-0000-0000-0000-0000000036bb');
insert into public.voices (id, user_id, name, consent_type, consent_confirmed_at, language) values
  ('00000000-0000-0000-0000-0000000036a1', '00000000-0000-0000-0000-0000000036aa', 'Mine', 'self', now(), 'en'),
  ('00000000-0000-0000-0000-0000000036b1', '00000000-0000-0000-0000-0000000036bb', 'Theirs', 'authorised', now(), 'fr');
-- Older voices carry no consent (the worker refuses to enroll them).
insert into public.voices (id, user_id, name) values
  ('00000000-0000-0000-0000-0000000036a2', '00000000-0000-0000-0000-0000000036aa', 'Legacy');

-- Consent shape.
select pg_temp.expect_error($$insert into public.voices (user_id, name, consent_type, consent_confirmed_at)
  values ('00000000-0000-0000-0000-0000000036aa', 'x', 'borrowed', now())$$, '23514');
select pg_temp.expect_error($$insert into public.voices (user_id, name, consent_type)
  values ('00000000-0000-0000-0000-0000000036aa', 'x', 'self')$$, '23514');
select pg_temp.expect_error($$insert into public.voices (user_id, name, consent_confirmed_at)
  values ('00000000-0000-0000-0000-0000000036aa', 'x', now())$$, '23514');
select pg_temp.expect_error($$update public.voices set quality = '[]' where id = '00000000-0000-0000-0000-0000000036a1'$$, '23514');

-- Engine artifacts: one per voice × engine × version.
insert into public.voice_engine_artifacts (voice_id, engine_id, engine_version, artifact_type, artifact_uri) values
  ('00000000-0000-0000-0000-0000000036a1', 'fal-minimax', '1', 'provider_voice_id', 'voice-123');
insert into public.voice_engine_artifacts (voice_id, engine_id, engine_version, artifact_type, artifact_uri) values
  ('00000000-0000-0000-0000-0000000036a1', 'fal-minimax', '2', 'provider_voice_id', 'voice-456');
select pg_temp.expect_error($$insert into public.voice_engine_artifacts (voice_id, engine_id, engine_version, artifact_type, artifact_uri)
  values ('00000000-0000-0000-0000-0000000036a1', 'fal-minimax', '1', 'provider_voice_id', 'again')$$, '23505');
select pg_temp.expect_error($$insert into public.voice_engine_artifacts (voice_id, engine_id, engine_version, artifact_type, artifact_uri)
  values ('00000000-0000-0000-0000-0000000036a1', 'x', '1', 'magic', 'u')$$, '23514');

-- Jobs: the eight states, terminal states final, owner and type fixed.
insert into public.voice_jobs (id, user_id, voice_id, type) values
  ('00000000-0000-0000-0000-00000036f001', '00000000-0000-0000-0000-0000000036aa', '00000000-0000-0000-0000-0000000036a1', 'voice.enroll'),
  ('00000000-0000-0000-0000-00000036f002', '00000000-0000-0000-0000-0000000036aa', null, 'speech.synthesis'),
  ('00000000-0000-0000-0000-00000036f003', '00000000-0000-0000-0000-0000000036bb', '00000000-0000-0000-0000-0000000036b1', 'speech.batch');
select pg_temp.expect_error($$insert into public.voice_jobs (user_id, type) values ('00000000-0000-0000-0000-0000000036aa', 'speech.sing')$$, '23514');
select pg_temp.expect_error($$update public.voice_jobs set status = 'done' where id = '00000000-0000-0000-0000-00000036f001'$$, '23514');
update public.voice_jobs set status = 'claimed' where id = '00000000-0000-0000-0000-00000036f001';
update public.voice_jobs set status = 'completed', result = '{"voice_id":"x"}' where id = '00000000-0000-0000-0000-00000036f001';
select pg_temp.expect_error($$update public.voice_jobs set status = 'failed' where id = '00000000-0000-0000-0000-00000036f001'$$, '42501');
select pg_temp.expect_error($$update public.voice_jobs set user_id = '00000000-0000-0000-0000-0000000036bb' where id = '00000000-0000-0000-0000-00000036f002'$$, '42501');
select pg_temp.expect_error($$update public.voice_jobs set type = 'speech.batch' where id = '00000000-0000-0000-0000-00000036f002'$$, '42501');

-- RLS: owners read their own jobs; nobody reads engine artifacts; no client writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000036aa', false);
do $$ begin
  assert (select count(*) from public.voice_jobs) = 2, 'owner sees only own jobs';
  assert (select count(*) from public.voice_engine_artifacts) = 0, 'engine internals hidden';
end $$;
select pg_temp.expect_error($$insert into public.voice_jobs (user_id, type) values ('00000000-0000-0000-0000-0000000036aa', 'speech.synthesis')$$, '42501');
select pg_temp.expect_error($$update public.voice_jobs set status = 'cancelled'$$, '42501');
reset role;

-- Deleting a voice drops its artifacts and keeps its jobs; deleting a user drops their jobs.
delete from public.voices where id = '00000000-0000-0000-0000-0000000036a1';
do $$ begin
  assert (select count(*) from public.voice_engine_artifacts) = 0, 'artifacts cascade';
  assert (select voice_id from public.voice_jobs where id = '00000000-0000-0000-0000-00000036f001') is null, 'job keeps history';
end $$;
delete from public.users where id = '00000000-0000-0000-0000-0000000036bb';
do $$ begin
  assert (select count(*) from public.voice_jobs where user_id = '00000000-0000-0000-0000-0000000036bb') = 0, 'jobs cascade with user';
end $$;

\echo 0036 voice engine: ok
