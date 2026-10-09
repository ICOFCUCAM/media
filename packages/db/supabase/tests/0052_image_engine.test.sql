-- Validation for migration 0052 (after stubs, 0026–0051).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

-- Owner O with project P, scene S, shots A (no video) and B (has video); stranger X.
insert into public.users (id) values ('00000000-0000-0000-0000-0000000052a0'), ('00000000-0000-0000-0000-0000000052b0');
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000052a1', '00000000-0000-0000-0000-0000000052a0');
insert into public.scenes (id, project_id, index) values ('00000000-0000-0000-0000-0000000052a2', '00000000-0000-0000-0000-0000000052a1', 0);
insert into public.shots (id, project_id, scene_id) values
  ('00000000-0000-0000-0000-0000000052a3', '00000000-0000-0000-0000-0000000052a1', '00000000-0000-0000-0000-0000000052a2'),
  ('00000000-0000-0000-0000-0000000052a4', '00000000-0000-0000-0000-0000000052a1', '00000000-0000-0000-0000-0000000052a2');
update public.shots set video_key = 'v.mp4' where id = '00000000-0000-0000-0000-0000000052a4';

insert into public.image_generations (id, project_id, purpose, subject, provider, model, seed, prompt_sha256, width, height, storage_key, sha256, candidate, chosen) values
  ('00000000-0000-0000-0000-0000000052c1', '00000000-0000-0000-0000-0000000052a1', 'seed_candidate', '00000000-0000-0000-0000-0000000052a3', 'fal-flux', 'fal-ai/flux/dev', 101, repeat('a', 64), 1280, 720, 'seeds/a-c1.png', repeat('b', 64), 0, true),
  ('00000000-0000-0000-0000-0000000052c2', '00000000-0000-0000-0000-0000000052a1', 'seed_candidate', '00000000-0000-0000-0000-0000000052a3', 'fal-flux', 'fal-ai/flux/dev', 102, repeat('a', 64), 1280, 720, 'seeds/a-c2.png', repeat('c', 64), 1, false),
  ('00000000-0000-0000-0000-0000000052c3', '00000000-0000-0000-0000-0000000052a1', 'seed_candidate', '00000000-0000-0000-0000-0000000052a4', 'fal-flux', 'fal-ai/flux/dev', 103, repeat('a', 64), 1280, 720, 'seeds/b-c1.png', null, 0, true);

-- Shape: hashes are sha256 hex; a candidate row has its index and only candidates have one.
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key) values ('00000000-0000-0000-0000-0000000052a1', 'seed_frame', 's', 'p', 'nothex', 'k')$$, '23514');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, candidate) values ('00000000-0000-0000-0000-0000000052a1', 'seed_frame', 's', 'p', repeat('a', 64), 'k', 0)$$, '23514');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key) values ('00000000-0000-0000-0000-0000000052a1', 'poster', 's', 'p', repeat('a', 64), 'k')$$, '23514');

-- The record is append-only; only `chosen` may change.
select pg_temp.expect_error($$update public.image_generations set storage_key = 'x' where id = '00000000-0000-0000-0000-0000000052c1'$$, '42501');
select pg_temp.expect_error($$delete from public.image_generations where id = '00000000-0000-0000-0000-0000000052c1'$$, '42501');

-- World references: one per (place or prop, digest), append-only, keys look like IR ids.
insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider) values ('00000000-0000-0000-0000-0000000052a1', 'location', 'loc_harbour', repeat('d', 64), 'w/loc.png', 'openai-image');
select pg_temp.expect_error($$insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider) values ('00000000-0000-0000-0000-0000000052a1', 'location', 'loc_harbour', repeat('d', 64), 'w/loc2.png', 'openai-image')$$, '23505');
select pg_temp.expect_error($$insert into public.world_references (project_id, kind, ref_key, digest, storage_key, provider) values ('00000000-0000-0000-0000-0000000052a1', 'prop', 'Bad Key', repeat('d', 64), 'w/p.png', 'x')$$, '23514');
select pg_temp.expect_error($$update public.world_references set storage_key = 'x'$$, '42501');

set role authenticated;
-- A stranger sees nothing and cannot choose.
select set_config('test.uid', '00000000-0000-0000-0000-0000000052b0', false);
do $$ begin if (select count(*) from public.image_generations) <> 0 or (select count(*) from public.world_references) <> 0 then raise exception 'stranger can read'; end if; end $$;
select pg_temp.expect_error($$select public.choose_seed_candidate('00000000-0000-0000-0000-0000000052c2')$$, '42501');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key) values ('00000000-0000-0000-0000-0000000052a1', 'seed_frame', 's', 'p', repeat('a', 64), 'k')$$, '42501');

-- The owner picks the second candidate: the shot's still changes and the choice moves.
select set_config('test.uid', '00000000-0000-0000-0000-0000000052a0', false);
do $$ begin if (select count(*) from public.image_generations) <> 3 then raise exception 'owner should read the record'; end if; end $$;
select public.choose_seed_candidate('00000000-0000-0000-0000-0000000052c2');
reset role;
do $$ begin
  if (select seed_image_key from public.shots where id = '00000000-0000-0000-0000-0000000052a3') <> 'seeds/a-c2.png' then raise exception 'still not changed'; end if;
  if (select string_agg(chosen::text, ',' order by candidate) from public.image_generations where subject = '00000000-0000-0000-0000-0000000052a3') <> 'false,true' then raise exception 'choice not moved'; end if;
end $$;

-- A shot that already has its video keeps its still.
set role authenticated;
select pg_temp.expect_error($$select public.choose_seed_candidate('00000000-0000-0000-0000-0000000052c3')$$, '55000');
reset role;

select 'ok 0052';
