-- Validation for migration 0051 (after stubs, 0026–0050).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

do $$ begin
  if has_function_privilege('anon', 'public.accept_voice_terms(uuid)', 'execute') then raise exception 'anon can accept terms'; end if;
  if has_function_privilege('anon', 'public.revoke_voice_licence(uuid)', 'execute') then raise exception 'anon can revoke'; end if;
  if not has_function_privilege('authenticated', 'public.accept_voice_terms(uuid)', 'execute') then raise exception 'signed-in users must accept terms'; end if;
  if has_function_privilege('authenticated', 'public.voice_usable_by(uuid, uuid)', 'execute') then raise exception 'voice_usable_by is internal'; end if;
  if has_function_privilege('authenticated', 'public.voiceovers_voice_guard()', 'execute') then raise exception 'the guard is a trigger only'; end if;
end $$;

-- The guard still fires for a signed-in user: someone else's private voice is refused.
create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000050b0', false);
insert into public.voiceovers (user_id, voice_id, title, text) values ('00000000-0000-0000-0000-0000000050b0', '00000000-0000-0000-0000-0000000050b1', 'Own again', 'Hello.');
select pg_temp.expect_error($$insert into public.voiceovers (user_id, voice_id, title, text) values ('00000000-0000-0000-0000-0000000050b0', '00000000-0000-0000-0000-0000000050a2', 'Theirs', 'Hello.')$$, '42501');
reset role;

select 'ok 0051';
