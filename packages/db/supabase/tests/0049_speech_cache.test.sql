-- Validation for migration 0049 (after stubs, 0026–0048).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000049aa');
insert into public.voices (id, user_id, name) values ('00000000-0000-0000-0000-0000000049a1', '00000000-0000-0000-0000-0000000049aa', 'Mine');

insert into public.speech_cache (key, engine_id, engine_version, voice_id, cloned, language, chars, storage_key, format) values
  (repeat('a', 64), 'fal-minimax', '1', '00000000-0000-0000-0000-0000000049a1', true, 'en', 22, 'audio_cache/voice/00000000-0000-0000-0000-0000000049a1/' || repeat('a', 64) || '.mp3', 'mp3'),
  (repeat('b', 64), 'openai-tts', '1', null, false, 'en', 22, 'audio_cache/stock/' || repeat('b', 64) || '.wav', 'wav');

-- Keys are sha256 hex; objects live under audio_cache/; a built-in voice names no voice.
select pg_temp.expect_error($$insert into public.speech_cache (key, engine_id, engine_version, cloned, language, chars, storage_key, format) values ('nothex', 'x', '1', false, 'en', 1, 'audio_cache/x', 'wav')$$, '23514');
select pg_temp.expect_error($$insert into public.speech_cache (key, engine_id, engine_version, cloned, language, chars, storage_key, format) values (repeat('c', 64), 'x', '1', false, 'en', 1, 'films/x.wav', 'wav')$$, '23514');
select pg_temp.expect_error($$insert into public.speech_cache (key, engine_id, engine_version, voice_id, cloned, language, chars, storage_key, format) values (repeat('d', 64), 'x', '1', '00000000-0000-0000-0000-0000000049a1', false, 'en', 1, 'audio_cache/d', 'wav')$$, '23514');

-- Owners never read the cache.
set role authenticated;
select pg_temp.expect_error($$select * from public.speech_cache$$, '42501');
reset role;

-- Deleting a voice orphans its clips for the worker to purge.
delete from public.voices where id = '00000000-0000-0000-0000-0000000049a1';
do $$ begin
  if (select count(*) from public.speech_cache where cloned and voice_id is null) <> 1 then raise exception 'orphan not marked'; end if;
end $$;

-- The voice benchmark suite.
insert into public.benchmark_runs (suite, status) values ('voice', 'incomplete');
select pg_temp.expect_error($$insert into public.benchmark_runs (suite, status) values ('dance', 'pass')$$, '23514');

select 'ok 0049' as result;
