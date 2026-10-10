-- Validation for migration 0056 (after stubs, 0026–0055).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000056a0');
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000056a1', '00000000-0000-0000-0000-0000000056a0');

-- The film's look is a world reference; one per digest.
insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider)
  values ('00000000-0000-0000-0000-0000000056a1', 'style', 'style_film', repeat('e', 64), 'w/style.png', 'fal-image');
select pg_temp.expect_error($$insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider) values ('00000000-0000-0000-0000-0000000056a1', 'style', 'style_film', repeat('e', 64), 'w/style2.png', 'fal-image')$$, '23505');
-- Other kinds and key shapes are still refused.
select pg_temp.expect_error($$insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider) values ('00000000-0000-0000-0000-0000000056a1', 'mood', 'style_film', repeat('f', 64), 'w/x.png', 'x')$$, '23514');
select pg_temp.expect_error($$insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider) values ('00000000-0000-0000-0000-0000000056a1', 'style', 'Look', repeat('f', 64), 'w/x.png', 'x')$$, '23514');
-- Still append-only.
select pg_temp.expect_error($$update public.world_references set storage_key = 'x' where ref_key = 'style_film'$$, '42501');
select 'ok 0056';
