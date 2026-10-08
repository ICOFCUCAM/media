-- Validation for migration 0034 (after stubs, 0026–0033).
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
  ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034aa'),
  ('00000000-0000-0000-0000-0000000034b1', '00000000-0000-0000-0000-0000000034bb');
insert into public.characters (id, project_id, name, appearance) values
  ('00000000-0000-0000-0000-0000000034c1', '00000000-0000-0000-0000-0000000034a1', 'Maya', 'short red hair'),
  ('00000000-0000-0000-0000-0000000034c2', '00000000-0000-0000-0000-0000000034b1', 'Ewan', 'grey beard');

insert into public.wardrobe_references (project_id, character_id, wardrobe_key, digest, storage_key, provider)
values ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034c1', 'wardrobe_red_coat', repeat('a', 64), 'projects/a/wardrobe/red.png', 'openai-image'),
       ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034c1', 'wardrobe_red_coat', repeat('b', 64), 'projects/a/wardrobe/red2.png', 'openai-image'),
       ('00000000-0000-0000-0000-0000000034b1', '00000000-0000-0000-0000-0000000034c2', 'wardrobe_oilskin', repeat('c', 64), 'projects/b/wardrobe/oil.png', 'openai-image');

-- Shape and uniqueness.
select pg_temp.expect_error($$insert into public.wardrobe_references (project_id, character_id, wardrobe_key, digest, storage_key, provider)
  values ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034c1', 'coat', repeat('a', 64), 'k', 'p')$$, '23514');
select pg_temp.expect_error($$insert into public.wardrobe_references (project_id, character_id, wardrobe_key, digest, storage_key, provider)
  values ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034c1', 'wardrobe_red_coat', 'short', 'k', 'p')$$, '23514');
select pg_temp.expect_error($$insert into public.wardrobe_references (project_id, character_id, wardrobe_key, digest, storage_key, provider)
  values ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034c1', 'wardrobe_red_coat', repeat('a', 64), 'k', 'p')$$, '23505');

-- Append-only.
select pg_temp.expect_error($$update public.wardrobe_references set storage_key = 'x'$$, '42501');
select pg_temp.expect_error($$delete from public.wardrobe_references$$, '42501');

-- RLS: owners read their own project's references only; no client writes.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000034aa', false);
do $$ begin
  assert (select count(*) from public.wardrobe_references) = 2, 'owner sees only own project';
end $$;
select pg_temp.expect_error($$insert into public.wardrobe_references (project_id, character_id, wardrobe_key, digest, storage_key, provider)
  values ('00000000-0000-0000-0000-0000000034a1', '00000000-0000-0000-0000-0000000034c1', 'wardrobe_x', repeat('d', 64), 'k', 'p')$$, '42501');
reset role;

-- Deleting the character or the project cascades.
delete from public.characters where id = '00000000-0000-0000-0000-0000000034c2';
delete from public.projects where id = '00000000-0000-0000-0000-0000000034a1';
do $$ begin
  assert (select count(*) from public.wardrobe_references) = 0, 'cascade';
end $$;

\echo 0034 wardrobe references: ok
