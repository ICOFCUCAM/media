-- Validation for migration 0058 (after stubs, 0026–0057).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000058aa');
insert into public.projects (id, user_id, title, kind, medium, animation_style, status, mode) values
  ('00000000-0000-0000-0000-0000000058a1', '00000000-0000-0000-0000-0000000058aa', 'A show', 'series', 'animation', '2d_tv', 'DRAFT', 'show');
insert into public.series (id, project_id, title) values ('00000000-0000-0000-0000-0000000058d1', '00000000-0000-0000-0000-0000000058a1', 'Kito''s Moon');

-- Season 1 (null = 1), then season 2; episode numbers run on.
insert into public.projects (user_id, kind, medium, animation_style, series_id, episode_number) values
  ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 1);
insert into public.projects (user_id, kind, medium, animation_style, series_id, episode_number, season_number) values
  ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 2, 1),
  ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 3, 2);
-- A later episode cannot go back a season, nor an earlier one forward.
select pg_temp.expect_error($$insert into public.projects (user_id, kind, medium, animation_style, series_id, episode_number, season_number) values ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 4, 1)$$, '23514');
select pg_temp.expect_error($$update public.projects set season_number = 3 where series_id = '00000000-0000-0000-0000-0000000058d1' and episode_number = 2$$, '23514');
-- Only episodes have seasons; seasons are 1–50.
select pg_temp.expect_error($$insert into public.projects (user_id, kind, season_number) values ('00000000-0000-0000-0000-0000000058aa', 'film', 2)$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, medium, animation_style, series_id, episode_number, season_number) values ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 9, 51)$$, '23514');
-- Season 2 continues; season 3 may start.
insert into public.projects (user_id, kind, medium, animation_style, series_id, episode_number, season_number) values
  ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 4, 2),
  ('00000000-0000-0000-0000-0000000058aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000058d1', 5, 3);
select 'ok 0058';
