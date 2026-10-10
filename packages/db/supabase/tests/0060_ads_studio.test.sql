-- Validation for migration 0060 (after stubs, 0026–0059).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000060a0'), ('00000000-0000-0000-0000-0000000060b0');
insert into public.projects (id, user_id, kind, status) values
  ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'advert', 'DRAFT'),
  ('00000000-0000-0000-0000-0000000060c2', '00000000-0000-0000-0000-0000000060b0', 'advert', 'DRAFT'),
  ('00000000-0000-0000-0000-0000000060c3', '00000000-0000-0000-0000-0000000060a0', 'film', 'DRAFT'),
  ('00000000-0000-0000-0000-0000000060c4', '00000000-0000-0000-0000-0000000060a0', 'advert', 'PLANNING');

-- The ad source is one object with at most 12 facts.
update public.projects set ad_source = '{"url": "https://flyttgo.example/", "facts": [{"kind": "benefit", "statement": "Flexible hours.", "quote": "on your own schedule"}]}'
  where id = '00000000-0000-0000-0000-0000000060c1';
select pg_temp.expect_error($$update public.projects set ad_source = '[]' where id = '00000000-0000-0000-0000-0000000060c1'$$, '23514');
select pg_temp.expect_error($$update public.projects set ad_source = '{"facts": {}}' where id = '00000000-0000-0000-0000-0000000060c1'$$, '23514');
select pg_temp.expect_error($$update public.projects set ad_source = jsonb_build_object('facts', (select jsonb_agg(jsonb_build_object('kind', 'benefit')) from generate_series(1, 13))) where id = '00000000-0000-0000-0000-0000000060c1'$$, '23514');

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000060a0', false);
-- The owner adds a logo and product photographs to their own advert while it waits.
insert into public.brand_assets (project_id, user_id, role, storage_key, name, mime, bytes) values
  ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'logo', 'brand/00000000-0000-0000-0000-0000000060a0/logo.png', 'logo.png', 'image/png', 2048);
insert into public.brand_assets (project_id, user_id, role, storage_key, name, mime, bytes)
  select '00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'product',
         'brand/00000000-0000-0000-0000-0000000060a0/p' || g || '.jpg', 'p.jpg', 'image/jpeg', 1000
  from generate_series(1, 8) g;
-- One logo; at most eight product photographs; images only; the owner's own folder.
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'logo', 'brand/00000000-0000-0000-0000-0000000060a0/logo2.png', 'image/png', 10)$$, '23505');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'product', 'brand/00000000-0000-0000-0000-0000000060a0/p9.jpg', 'image/jpeg', 10)$$, '23514');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'product', 'brand/00000000-0000-0000-0000-0000000060a0/x.svg', 'image/svg+xml', 10)$$, '23514');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'product', 'brand/00000000-0000-0000-0000-0000000060b0/x.png', 'image/png', 10)$$, '23514');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c1', '00000000-0000-0000-0000-0000000060a0', 'product', 'voices/00000000-0000-0000-0000-0000000060a0/x.png', 'image/png', 10)$$, '23514');
-- Not someone else's advert, not as someone else, not a film, not once it is queued.
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c2', '00000000-0000-0000-0000-0000000060a0', 'logo', 'brand/00000000-0000-0000-0000-0000000060a0/l.png', 'image/png', 10)$$, '42501');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c2', '00000000-0000-0000-0000-0000000060b0', 'logo', 'brand/00000000-0000-0000-0000-0000000060b0/l.png', 'image/png', 10)$$, '42501');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c3', '00000000-0000-0000-0000-0000000060a0', 'logo', 'brand/00000000-0000-0000-0000-0000000060a0/l.png', 'image/png', 10)$$, '42501');
select pg_temp.expect_error($$insert into public.brand_assets (project_id, user_id, role, storage_key, mime, bytes) values ('00000000-0000-0000-0000-0000000060c4', '00000000-0000-0000-0000-0000000060a0', 'logo', 'brand/00000000-0000-0000-0000-0000000060a0/l.png', 'image/png', 10)$$, '42501');
-- Files are recorded, not edited; the owner may remove one.
select pg_temp.expect_error($$update public.brand_assets set role = 'logo'$$, '42501');
delete from public.brand_assets where storage_key = 'brand/00000000-0000-0000-0000-0000000060a0/p8.jpg';
select set_config('test.uid', '00000000-0000-0000-0000-0000000060b0', false);
do $$ begin
  if (select count(*) from public.brand_assets) <> 0 then raise exception 'another owner sees brand files'; end if;
end $$;
reset role;

-- The worker reads them all.
do $$ begin
  if (select count(*) from public.brand_assets where project_id = '00000000-0000-0000-0000-0000000060c1') <> 8 then raise exception 'expected a logo and 7 product photographs'; end if;
end $$;
select 'ok 0060';
