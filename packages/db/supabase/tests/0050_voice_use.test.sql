-- Validation for migration 0050 (after stubs, 0026–0049).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Owner O offers a voice; user U wants to use it; P is private.
insert into public.users (id) values ('00000000-0000-0000-0000-0000000050a0'), ('00000000-0000-0000-0000-0000000050b0');
insert into public.voices (id, user_id, name, status, share_status, share_terms, consent_type, consent_confirmed_at) values
  ('00000000-0000-0000-0000-0000000050a1', '00000000-0000-0000-0000-0000000050a0', 'Shared', 'READY', 'APPROVED', 'non-commercial only', 'self', now()),
  ('00000000-0000-0000-0000-0000000050a2', '00000000-0000-0000-0000-0000000050a0', 'Private', 'READY', 'PRIVATE', null, 'self', now()),
  ('00000000-0000-0000-0000-0000000050b1', '00000000-0000-0000-0000-0000000050b0', 'Mine', 'READY', 'PRIVATE', null, 'self', now());

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000050b0', false);

-- Own voice: fine. Someone else's voice without a licence: refused, server-side.
insert into public.voiceovers (user_id, voice_id, title, text) values ('00000000-0000-0000-0000-0000000050b0', '00000000-0000-0000-0000-0000000050b1', 'Own', 'Hello.');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, voice_id, title, text) values ('00000000-0000-0000-0000-0000000050b0', '00000000-0000-0000-0000-0000000050a1', 'Borrowed', 'Hello.')$$, '42501');

-- Licences are never written directly; the private voice cannot be licensed; one's own needs none.
select pg_temp.expect_error($$insert into public.voice_licences (voice_id, licensee_id) values ('00000000-0000-0000-0000-0000000050a1', '00000000-0000-0000-0000-0000000050b0')$$, '42501');
select pg_temp.expect_error($$select public.accept_voice_terms('00000000-0000-0000-0000-0000000050a2')$$, 'P0002');
select pg_temp.expect_error($$select public.accept_voice_terms('00000000-0000-0000-0000-0000000050b1')$$, 'P0002');

-- Accepting the terms snapshots them and allows the reading.
select public.accept_voice_terms('00000000-0000-0000-0000-0000000050a1');
do $$ begin
  if (select terms from public.voice_licences where licensee_id = '00000000-0000-0000-0000-0000000050b0') <> 'non-commercial only' then raise exception 'terms not snapshotted'; end if;
end $$;
insert into public.voiceovers (user_id, voice_id, title, text) values ('00000000-0000-0000-0000-0000000050b0', '00000000-0000-0000-0000-0000000050a1', 'Borrowed', 'Hello.');

-- A conversation: every speaker's voice is checked; two speakers at least; labels required.
insert into public.voiceovers (user_id, title, text, mode, speakers) values ('00000000-0000-0000-0000-0000000050b0', 'Talk', 'A: hi
B: hello', 'conversation',
  '[{"label":"A","voice_id":"00000000-0000-0000-0000-0000000050b1"},{"label":"B","voice_id":"00000000-0000-0000-0000-0000000050a1"}]');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, title, text, mode, speakers) values ('00000000-0000-0000-0000-0000000050b0', 'T', 'A: hi', 'conversation', '[{"label":"A","voice_id":"00000000-0000-0000-0000-0000000050a2"},{"label":"B"}]')$$, '42501');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, title, text, mode, speakers) values ('00000000-0000-0000-0000-0000000050b0', 'T', 'A: hi', 'conversation', '[{"label":"A"}]')$$, '22023');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, title, text, mode, speakers) values ('00000000-0000-0000-0000-0000000050b0', 'T', 'x', 'conversation', '[{"label":""},{"label":"B"}]')$$, '22023');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, title, text, mode) values ('00000000-0000-0000-0000-0000000050b0', 'T', 'x', 'shouting')$$, '23514');

-- Revoking the licence stops new readings with that voice; existing rows can't be re-pointed to it.
select public.revoke_voice_licence('00000000-0000-0000-0000-0000000050a1');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, voice_id, title, text) values ('00000000-0000-0000-0000-0000000050b0', '00000000-0000-0000-0000-0000000050a1', 'Again', 'Hello.')$$, '42501');

-- The owner sees who holds a licence to their voice; a stranger sees nothing.
select set_config('test.uid', '00000000-0000-0000-0000-0000000050a0', false);
do $$ begin if (select count(*) from public.voice_licences) <> 1 then raise exception 'owner should see the licence'; end if; end $$;
reset role;

-- When the owner withdraws the voice from the shelf, a held licence no longer allows new readings.
update public.voice_licences set revoked_at = null;
update public.voices set share_status = 'PRIVATE' where id = '00000000-0000-0000-0000-0000000050a1';
do $$ begin
  if public.voice_usable_by('00000000-0000-0000-0000-0000000050a1', '00000000-0000-0000-0000-0000000050b0') then raise exception 'withdrawn voice still usable'; end if;
end $$;

select 'ok 0050';
