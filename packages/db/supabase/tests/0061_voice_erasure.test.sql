-- Validation for migration 0061 (after stubs, 0026–0060).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000061a0'), ('00000000-0000-0000-0000-0000000061b0');
insert into public.voices (id, user_id, name) values
  ('00000000-0000-0000-0000-0000000061c1', '00000000-0000-0000-0000-0000000061a0', 'My voice'),
  ('00000000-0000-0000-0000-0000000061c2', '00000000-0000-0000-0000-0000000061b0', 'Theirs');
insert into public.voice_engine_artifacts (voice_id, engine_id, engine_version, artifact_type, artifact_uri) values
  ('00000000-0000-0000-0000-0000000061c1', 'fal-minimax', '1', 'provider_voice_id', 'voice-abc'),
  ('00000000-0000-0000-0000-0000000061c1', 'fal-minimax', '2', 'reference_audio', 'voices/u/ref.wav');

-- The owner deletes the voice: what it leaves behind is recorded first.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000061a0', false);
delete from public.voices where id = '00000000-0000-0000-0000-0000000061c1';
do $$
declare r record;
begin
  select * into r from public.voice_erasures where voice_id = '00000000-0000-0000-0000-0000000061c1';
  if r is null then raise exception 'no erasure recorded'; end if;
  if r.status <> 'pending' or r.name <> 'My voice' or jsonb_array_length(r.artifacts) <> 2 then
    raise exception 'erasure wrong: % % %', r.status, r.name, r.artifacts;
  end if;
end $$;
-- Owners read their own erasures, never write them.
select pg_temp.expect_error($$insert into public.voice_erasures (voice_id, user_id) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000061a0')$$, '42501');
select pg_temp.expect_error($$update public.voice_erasures set status = 'done'$$, '42501');
reset role;
delete from public.voices where id = '00000000-0000-0000-0000-0000000061c2';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000061a0', false);
do $$ begin
  if (select count(*) from public.voice_erasures) <> 1 then raise exception 'owner sees another account''s erasure'; end if;
end $$;
reset role;
select pg_temp.expect_error($$update public.voice_erasures set status = 'gone'$$, '23514');
select pg_temp.expect_error($$update public.voice_erasures set provider_outcome = 'maybe'$$, '23514');
-- The artifacts went with the voice.
do $$ begin
  if exists (select 1 from public.voice_engine_artifacts where voice_id = '00000000-0000-0000-0000-0000000061c1') then raise exception 'artifacts left'; end if;
end $$;
select 'ok 0061';
