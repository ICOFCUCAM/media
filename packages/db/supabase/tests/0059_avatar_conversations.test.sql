-- Validation for migration 0059 (after stubs, 0026–0058).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000059a0'), ('00000000-0000-0000-0000-0000000059b0');
insert into public.avatar_conversations (id, user_id, persona, language) values
  ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'A patient chemistry teacher.', 'en'),
  ('00000000-0000-0000-0000-0000000059c2', '00000000-0000-0000-0000-0000000059b0', 'A pirate.', 'en');

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000059a0', false);
-- The owner adds a typed line and a recorded one.
insert into public.avatar_turns (conversation_id, user_id, role, text) values ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'user', 'Why is the sky blue?');
insert into public.avatar_turns (conversation_id, user_id, role, audio_key) values ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'user', 'talk/u/q.webm');
-- Not the avatar's lines, not a finished status, not someone else's conversation, not an empty line.
select pg_temp.expect_error($$insert into public.avatar_turns (conversation_id, user_id, role, text) values ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'avatar', 'I am the avatar')$$, '42501');
select pg_temp.expect_error($$insert into public.avatar_turns (conversation_id, user_id, role, text, status) values ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'user', 'x', 'ready')$$, '42501');
select pg_temp.expect_error($$insert into public.avatar_turns (conversation_id, user_id, role, text) values ('00000000-0000-0000-0000-0000000059c2', '00000000-0000-0000-0000-0000000059a0', 'user', 'hello')$$, '42501');
select pg_temp.expect_error($$insert into public.avatar_turns (conversation_id, user_id, role) values ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'user')$$, '23514');
reset role;

-- The worker writes the reply and moves the statuses.
insert into public.avatar_turns (conversation_id, user_id, role, text, status) values ('00000000-0000-0000-0000-0000000059c1', '00000000-0000-0000-0000-0000000059a0', 'avatar', 'Sunlight scatters off the air itself.', 'speaking');
update public.avatar_turns set status = 'ready' where role = 'user' and text is not null;
select pg_temp.expect_error($$update public.avatar_turns set status = 'done'$$, '23514');
select pg_temp.expect_error($$insert into public.avatar_conversations (user_id, persona) values ('00000000-0000-0000-0000-0000000059a0', '')$$, '23514');
select 'ok 0059';
