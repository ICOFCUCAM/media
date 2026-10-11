-- Validation for migration 0063 (after stubs, 0026–0062).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000063a0');
insert into public.projects (id, user_id) values ('00000000-0000-0000-0000-0000000063a1', '00000000-0000-0000-0000-0000000063a0');

-- A still from the image runtime names its workflow and runtime.
insert into public.image_generations (id, project_id, purpose, subject, provider, model, seed, prompt_sha256, width, height, storage_key, sha256,
  runtime, workflow_id, workflow_version, workflow_sha256) values
  ('00000000-0000-0000-0000-0000000063c1', '00000000-0000-0000-0000-0000000063a1', 'seed_frame', 'shot-1', 'comfyui-image', 'qwen-image', 42,
   repeat('a', 64), 1344, 768, 'projects/p/seeds/shot-1.png', repeat('b', 64),
   'comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2', 'cineforge.still.t2i', 1, repeat('c', 64));
-- Other providers leave all four null (earlier rows are unaffected).
insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key) values
  ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 'shot-2', 'fal-image', repeat('a', 64), 'k2');

-- Shape: a workflow in full, with its runtime; hashes are sha256 hex; ids are registry ids.
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, runtime, workflow_id) values ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 's', 'comfyui-image', repeat('a', 64), 'k', 'comfyui@x', 'cineforge.still.t2i')$$, '23514');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, workflow_id, workflow_version, workflow_sha256) values ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 's', 'comfyui-image', repeat('a', 64), 'k', 'cineforge.still.t2i', 1, repeat('c', 64))$$, '23514');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, runtime, workflow_id, workflow_version, workflow_sha256) values ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 's', 'comfyui-image', repeat('a', 64), 'k', 'comfyui@x', 'cineforge.still.t2i', 1, 'nothex')$$, '23514');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, runtime, workflow_id, workflow_version, workflow_sha256) values ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 's', 'comfyui-image', repeat('a', 64), 'k', 'comfyui@x', 'User Graph!', 1, repeat('c', 64))$$, '23514');
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, runtime, workflow_id, workflow_version, workflow_sha256) values ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 's', 'comfyui-image', repeat('a', 64), 'k', 'comfyui@x', 'cineforge.still.t2i', 0, repeat('c', 64))$$, '23514');

-- Still append-only: the provenance of a still can never be rewritten.
select pg_temp.expect_error($$update public.image_generations set workflow_sha256 = repeat('d', 64) where id = '00000000-0000-0000-0000-0000000063c1'$$, '42501');
select pg_temp.expect_error($$update public.image_generations set runtime = 'comfyui@other' where id = '00000000-0000-0000-0000-0000000063c1'$$, '42501');

-- Clients still cannot write the ledger.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000063a0', false);
select pg_temp.expect_error($$insert into public.image_generations (project_id, purpose, subject, provider, prompt_sha256, storage_key, runtime, workflow_id, workflow_version, workflow_sha256) values ('00000000-0000-0000-0000-0000000063a1', 'seed_frame', 's', 'comfyui-image', repeat('a', 64), 'k', 'comfyui@x', 'cineforge.still.t2i', 1, repeat('c', 64))$$, '42501');
-- The owner reads the provenance of their stills.
do $$ begin
  if (select workflow_id from public.image_generations where id = '00000000-0000-0000-0000-0000000063c1') <> 'cineforge.still.t2i' then raise exception 'owner cannot read workflow provenance'; end if;
end $$;
reset role;

select 'ok 0063';
