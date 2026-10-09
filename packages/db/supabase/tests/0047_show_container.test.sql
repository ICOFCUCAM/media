-- Validation for migration 0047 (after stubs, 0026–0046).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- A show container: a DRAFT series with no episode count.
insert into public.projects (user_id, kind, medium, animation_style, mode, status) values
  ('00000000-0000-0000-0000-0000000047aa', 'series', 'animation', '2d_tv', 'show', 'DRAFT');
-- A one-pass season still needs 1–5 episodes.
select pg_temp.expect_error($$insert into public.projects (user_id, kind) values ('00000000-0000-0000-0000-0000000047aa', 'series')$$, '23514');
-- A show has no episode count and is never queued; only a series is a show.
select pg_temp.expect_error($$insert into public.projects (user_id, kind, mode, status, episodes) values ('00000000-0000-0000-0000-0000000047aa', 'series', 'show', 'DRAFT', 3)$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, mode, status) values ('00000000-0000-0000-0000-0000000047aa', 'series', 'show', 'PLANNING')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, mode, status) values ('00000000-0000-0000-0000-0000000047aa', 'film', 'show', 'DRAFT')$$, '23514');
select pg_temp.expect_error($$update public.projects set status = 'PLANNING' where mode = 'show'$$, '23514');

select 'ok 0047' as result;
