-- Validation for migration 0045 (after stubs, 0026–0044).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Existing rows become live-action films.
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000045a1', '00000000-0000-0000-0000-0000000045aa');
do $$ begin
  if (select kind || '/' || medium || '/' || coalesce(animation_style, '-') from public.projects where id = '00000000-0000-0000-0000-0000000045a1') <> 'film/live_action/-' then
    raise exception 'default should be a live-action film';
  end if;
end $$;

-- Valid productions.
insert into public.projects (user_id, kind, medium, animation_style) values ('00000000-0000-0000-0000-0000000045aa', 'short_film', 'animation', 'anime');
insert into public.projects (user_id, kind, medium, animation_style, episodes) values ('00000000-0000-0000-0000-0000000045aa', 'series', 'animation', '2d_tv', 8);
insert into public.projects (user_id, kind, medium, animation_style) values ('00000000-0000-0000-0000-0000000045aa', 'motion_comic', 'animation', 'motion_comic');
insert into public.projects (user_id, kind) values ('00000000-0000-0000-0000-0000000045aa', 'advert');

-- Invalid ones.
select pg_temp.expect_error($$insert into public.projects (user_id, kind) values ('00000000-0000-0000-0000-0000000045aa', 'podcast')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, medium) values ('00000000-0000-0000-0000-0000000045aa', 'animation')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, animation_style) values ('00000000-0000-0000-0000-0000000045aa', 'anime')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, medium, animation_style) values ('00000000-0000-0000-0000-0000000045aa', 'animation', 'watercolour')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, medium, animation_style) values ('00000000-0000-0000-0000-0000000045aa', 'motion_comic', 'animation', 'anime')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind) values ('00000000-0000-0000-0000-0000000045aa', 'series')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, episodes) values ('00000000-0000-0000-0000-0000000045aa', 'series', 60)$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, episodes) values ('00000000-0000-0000-0000-0000000045aa', 'film', 3)$$, '23514');

select 'ok 0045' as result;
