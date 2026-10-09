-- Validation for migration 0046 (after stubs, 0026–0045).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Two owners: A (…46aa) and B (…46bb).
insert into public.projects (id, user_id, title) values
  ('00000000-0000-0000-0000-0000000046a1', '00000000-0000-0000-0000-0000000046aa', 'A library'),
  ('00000000-0000-0000-0000-0000000046a2', '00000000-0000-0000-0000-0000000046aa', 'A film'),
  ('00000000-0000-0000-0000-0000000046b1', '00000000-0000-0000-0000-0000000046bb', 'B library');
insert into public.projects (id, user_id, title, kind, medium, animation_style, episodes) values
  ('00000000-0000-0000-0000-0000000046a3', '00000000-0000-0000-0000-0000000046aa', 'A show', 'series', 'animation', '2d_tv', 3);

-- Character Cards.
insert into public.characters (id, project_id, name, appearance, height_cm, hair, eyes, clothing, animation_style, design) values
  ('00000000-0000-0000-0000-0000000046c1', '00000000-0000-0000-0000-0000000046a1', 'Kito', 'a curious boy', 145, 'black', 'brown', 'blue jacket', '2d_tv',
   '{"proportions": "big head", "palette": "blue jacket #1e5aa8", "movement": "bouncy"}'),
  ('00000000-0000-0000-0000-0000000046c2', '00000000-0000-0000-0000-0000000046b1', 'Zara', 'B''s character', null, null, null, null, null, null);
select pg_temp.expect_error($$insert into public.characters (project_id, name, appearance, height_cm) values ('00000000-0000-0000-0000-0000000046a1', 'x', 'x', 5)$$, '23514');
select pg_temp.expect_error($$insert into public.characters (project_id, name, appearance, animation_style) values ('00000000-0000-0000-0000-0000000046a1', 'x', 'x', 'oil')$$, '23514');
select pg_temp.expect_error($$insert into public.characters (project_id, name, appearance, design) values ('00000000-0000-0000-0000-0000000046a1', 'x', 'x', '{"palette": "red"}')$$, '23514');
select pg_temp.expect_error($$update public.characters set source_character_id = id where id = '00000000-0000-0000-0000-0000000046c1'$$, '23514');
-- A production's Kito points back at the card.
insert into public.characters (project_id, name, appearance, source_character_id) values
  ('00000000-0000-0000-0000-0000000046a2', 'Kito', 'a curious boy', '00000000-0000-0000-0000-0000000046c1');

-- Cast: as A, cast A's card into A's film — never B's card.
grant select, insert, update, delete on public.project_cast, public.show_bibles to authenticated;
set test.uid = '00000000-0000-0000-0000-0000000046aa';
set role authenticated;
insert into public.project_cast (project_id, character_id) values ('00000000-0000-0000-0000-0000000046a2', '00000000-0000-0000-0000-0000000046c1');
select pg_temp.expect_error($$insert into public.project_cast (project_id, character_id) values ('00000000-0000-0000-0000-0000000046a2', '00000000-0000-0000-0000-0000000046c2')$$, '42501');
select pg_temp.expect_error($$insert into public.project_cast (project_id, character_id) values ('00000000-0000-0000-0000-0000000046b1', '00000000-0000-0000-0000-0000000046c1')$$, '42501');
reset role;

-- Show Bible: one per show, owner only.
insert into public.series (id, project_id, title) values ('00000000-0000-0000-0000-0000000046d1', '00000000-0000-0000-0000-0000000046a3', 'Kito''s Moon');
set role authenticated;
insert into public.show_bibles (series_id, genre, audience, episode_format) values ('00000000-0000-0000-0000-0000000046d1', 'adventure', 'children 6–10', 'cold open, two acts');
select pg_temp.expect_error($$insert into public.show_bibles (series_id) values ('00000000-0000-0000-0000-0000000046d1')$$, '23505');
reset role;
set test.uid = '00000000-0000-0000-0000-0000000046bb';
set role authenticated;
do $$ begin
  if exists (select 1 from public.show_bibles) then raise exception 'B must not see A''s show bible'; end if;
end $$;
reset role;

-- Episode productions.
insert into public.projects (user_id, kind, medium, animation_style, series_id, episode_number) values
  ('00000000-0000-0000-0000-0000000046aa', 'episode', 'animation', '2d_tv', '00000000-0000-0000-0000-0000000046d1', 7);
select pg_temp.expect_error($$insert into public.projects (user_id, kind) values ('00000000-0000-0000-0000-0000000046aa', 'episode')$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, series_id, episode_number) values ('00000000-0000-0000-0000-0000000046aa', 'film', '00000000-0000-0000-0000-0000000046d1', 2)$$, '23514');
select pg_temp.expect_error($$insert into public.projects (user_id, kind, series_id, episode_number) values ('00000000-0000-0000-0000-0000000046aa', 'episode', '00000000-0000-0000-0000-0000000046d1', 0)$$, '23514');
-- B cannot attach an episode to A's show.
select pg_temp.expect_error($$insert into public.projects (user_id, kind, series_id, episode_number) values ('00000000-0000-0000-0000-0000000046bb', 'episode', '00000000-0000-0000-0000-0000000046d1', 2)$$, '42501');
-- A series planned in one pass has at most 5 episodes.
select pg_temp.expect_error($$insert into public.projects (user_id, kind, episodes) values ('00000000-0000-0000-0000-0000000046aa', 'series', 6)$$, '23514');

-- An episode row records the production that made it.
insert into public.seasons (id, series_id, number) values ('00000000-0000-0000-0000-0000000046e1', '00000000-0000-0000-0000-0000000046d1', 1);
insert into public.episodes (season_id, number, title, project_id)
  select '00000000-0000-0000-0000-0000000046e1', 7, 'Episode 7', id from public.projects where episode_number = 7;

-- Deleting the show deletes its episode productions.
delete from public.projects where id = '00000000-0000-0000-0000-0000000046a3';
do $$ begin
  if exists (select 1 from public.projects where kind = 'episode' and user_id = '00000000-0000-0000-0000-0000000046aa') then
    raise exception 'episode productions should go with their show';
  end if;
end $$;

select 'ok 0046' as result;
