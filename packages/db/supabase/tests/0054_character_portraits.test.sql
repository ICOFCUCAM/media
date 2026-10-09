-- Validation for migration 0054 (after stubs, 0026–0053).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000054a0');
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000054a1', '00000000-0000-0000-0000-0000000054a0');
insert into public.characters (id, project_id, name, appearance) values ('00000000-0000-0000-0000-0000000054c1', '00000000-0000-0000-0000-0000000054a1', 'Kito', 'a small fox');

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000054a0', false);
-- A client asks for a portrait; it cannot write one, fail one or claim one.
update public.characters set portrait_status = 'requested' where id = '00000000-0000-0000-0000-0000000054c1';
select pg_temp.expect_error($$update public.characters set portrait_key = 'x.png' where id = '00000000-0000-0000-0000-0000000054c1'$$, '42501');
select pg_temp.expect_error($$update public.characters set portrait_status = 'ready' where id = '00000000-0000-0000-0000-0000000054c1'$$, '42501');
select pg_temp.expect_error($$update public.characters set portrait_status = 'generating' where id = '00000000-0000-0000-0000-0000000054c1'$$, '42501');
select pg_temp.expect_error($$insert into public.characters (project_id, name, appearance, portrait_key) values ('00000000-0000-0000-0000-0000000054a1', 'Mo', 'x', 'k')$$, '42501');
-- Other card fields still edit freely.
update public.characters set appearance = 'a small red fox' where id = '00000000-0000-0000-0000-0000000054c1';
reset role;

-- The server claims and finishes it.
update public.characters set portrait_status = 'generating' where id = '00000000-0000-0000-0000-0000000054c1';
set role authenticated;
-- While it is being drawn, the client cannot reset it.
select pg_temp.expect_error($$update public.characters set portrait_status = 'requested' where id = '00000000-0000-0000-0000-0000000054c1'$$, '42501');
reset role;
update public.characters set portrait_status = 'ready', portrait_key = 'characters/k/portrait.png' where id = '00000000-0000-0000-0000-0000000054c1';
set role authenticated;
-- A finished portrait can be asked for again.
update public.characters set portrait_status = 'requested' where id = '00000000-0000-0000-0000-0000000054c1';
reset role;
select pg_temp.expect_error($$update public.characters set portrait_status = 'drawn' where id = '00000000-0000-0000-0000-0000000054c1'$$, '23514');

-- The ledger takes portraits.
insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key) values
  ('00000000-0000-0000-0000-0000000054a1', 'portrait', '00000000-0000-0000-0000-0000000054c1', 'fal-flux', repeat('a', 64), 'characters/k/portrait.png');
select 'ok 0054';
