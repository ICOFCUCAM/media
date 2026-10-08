-- Validation for migration 0031 (after stubs, 0026–0030).
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
  ('00000000-0000-0000-0000-0000000031a1', '00000000-0000-0000-0000-0000000031aa'),
  ('00000000-0000-0000-0000-0000000031b1', '00000000-0000-0000-0000-0000000031bb');

-- Degradations: valid rows insert; malformed ones are refused.
insert into public.production_degradations (project_id, code, severity, scope, ref_id, message, detail) values
  ('00000000-0000-0000-0000-0000000031a1', 'OUTPUT_CLAMPED', 'major', 'shot', 'shot-1',
   'Generated 1.56 s of the requested 5 s (25/80 frames).', '{"requestedFrames":80,"producedFrames":25}'),
  ('00000000-0000-0000-0000-0000000031b1', 'TRACK_MISSING', 'major', 'film', null, 'No music track.', null);
select pg_temp.expect_error($$insert into public.production_degradations (project_id, code, severity, scope, message)
  values ('00000000-0000-0000-0000-0000000031a1', 'lowercase', 'major', 'shot', 'm')$$, '23514');
select pg_temp.expect_error($$insert into public.production_degradations (project_id, code, severity, scope, message)
  values ('00000000-0000-0000-0000-0000000031a1', 'OUTPUT_CLAMPED', 'fatal', 'shot', 'm')$$, '23514');
select pg_temp.expect_error($$insert into public.production_degradations (project_id, code, severity, scope, message)
  values ('00000000-0000-0000-0000-0000000031a1', 'OUTPUT_CLAMPED', 'major', 'shot', '')$$, '23514');

-- Append-only, even for the table owner.
select pg_temp.expect_error($$update public.production_degradations set message = 'hidden'$$, '42501');
select pg_temp.expect_error($$delete from public.production_degradations$$, '42501');

-- Capabilities: nothing unreal may claim to work.
insert into public.system_capabilities (capability, provider, status, real_execution, requires_gpu, supports, reported_by)
values ('video_generation', 'wan-2.1', 'experimental', true, true, '{480p}', 'worker');
select pg_temp.expect_error($$insert into public.system_capabilities (capability, status, real_execution, reported_by)
  values ('upscale_4k', 'experimental', false, 'worker')$$, '23514');
insert into public.system_capabilities (capability, status, real_execution, reported_by)
values ('upscale_4k', 'unavailable', false, 'worker');
update public.system_capabilities set status = 'production_ready' where capability = 'video_generation';
select pg_temp.expect_error($$update public.system_capabilities set real_execution = false where capability = 'video_generation'$$, '23514');

-- RLS: an owner reads only their own degradations; nobody writes from the client.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000031aa', false);
do $$ begin
  assert (select count(*) from public.production_degradations) = 1, 'owner sees only own project';
  assert (select count(*) from public.system_capabilities) = 2, 'capabilities readable when signed in';
end $$;
select pg_temp.expect_error($$insert into public.production_degradations (project_id, code, severity, scope, message)
  values ('00000000-0000-0000-0000-0000000031a1', 'OUTPUT_CLAMPED', 'major', 'shot', 'm')$$, '42501');
select pg_temp.expect_error($$update public.system_capabilities set status = 'production_ready'$$, '42501');
reset role;
set role anon;
select pg_temp.expect_error($$select count(*) from public.system_capabilities$$, '42501');
reset role;

-- Deleting a project removes its history with it (cascade is allowed).
delete from public.projects where id = '00000000-0000-0000-0000-0000000031b1';
do $$ begin
  assert (select count(*) from public.production_degradations
          where project_id = '00000000-0000-0000-0000-0000000031b1') = 0, 'cascade';
end $$;

\echo 0031 truth layer: ok
