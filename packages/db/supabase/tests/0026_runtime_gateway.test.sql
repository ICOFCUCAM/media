-- Validation for migration 0026 (run by CI against a scratch Postgres).
-- Each block must succeed; blocks named "must fail" assert the rejection.
\set ON_ERROR_STOP on

-- Fixtures: a pending deployment, then approval.
insert into public.runtime_deployments (id, model_id, base_url) values ('dep-1', 'wan-2.1', 'https://pod-1');

-- must fail: enforce without approval, manifest and immutable image
do $$ begin
  update public.runtime_deployments set enforcement = 'enforce' where id = 'dep-1';
  raise exception 'expected check violation';
exception when check_violation then null; end $$;

-- must fail: a mutable tag is not an approved image
do $$ begin
  update public.runtime_deployments set approved_image = 'icofcucam/cineforge-gpu:latest' where id = 'dep-1';
  raise exception 'expected check violation';
exception when check_violation then null; end $$;

update public.runtime_deployments
   set status = 'approved',
       manifest = '{"authzVersion":1,"runtime":"diffusers@0.33.1","models":[]}',
       approved_image = 'icofcucam/cineforge-gpu@sha256:' || repeat('ab', 32)
 where id = 'dep-1';
update public.runtime_deployments set enforcement = 'enforce' where id = 'dep-1';

-- every row change produced an audit event
do $$ begin
  if (select count(*) from public.runtime_gateway_events where type = 'deployment.row_changed' and deployment_id = 'dep-1') <> 2 then
    raise exception 'expected 2 deployment.row_changed events, got %',
      (select count(*) from public.runtime_gateway_events where type = 'deployment.row_changed' and deployment_id = 'dep-1');
  end if;
end $$;

-- must fail: events are append-only
do $$ begin
  update public.runtime_gateway_events set code = 'x';
  raise exception 'expected append-only rejection';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.runtime_gateway_events;
  raise exception 'expected append-only rejection';
exception when insufficient_privilege then null; end $$;

-- grants: outcome fields may be completed, identity fields may not change
insert into public.runtime_execution_grants (id, jti, deployment_id, shot_id, project_id, scope, mode, authz_digest, body_sha256, outcome)
values ('g_1', 'jti-1', 'dep-1', gen_random_uuid(), gen_random_uuid(), 'video:run', 'enforce', repeat('d', 64), repeat('b', 64), 'issued');
update public.runtime_execution_grants set outcome = 'completed', gpu_ms = 900, output_bytes = 1234, completed_at = now() where id = 'g_1';

do $$ begin
  update public.runtime_execution_grants set authz_digest = repeat('e', 64) where id = 'g_1';
  raise exception 'expected identity-change rejection';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.runtime_execution_grants where id = 'g_1';
  raise exception 'expected delete rejection';
exception when insufficient_privilege then null; end $$;

-- must fail: grant for an unknown deployment
do $$ begin
  insert into public.runtime_execution_grants (id, deployment_id, scope, mode, outcome) values ('g_2', 'dep-missing', 'status', 'report', 'issued');
  raise exception 'expected foreign key violation';
exception when foreign_key_violation then null; end $$;

-- must fail: a deployment with grants cannot be deleted
do $$ begin
  delete from public.runtime_deployments where id = 'dep-1';
  raise exception 'expected restrict';
exception when foreign_key_violation then null; end $$;

-- RLS: enabled on all three tables, no client write policy
do $$ begin
  if (select count(*) from pg_tables where schemaname = 'public'
        and tablename in ('runtime_deployments', 'runtime_execution_grants', 'runtime_gateway_events') and rowsecurity) <> 3 then
    raise exception 'RLS not enabled on all gateway tables';
  end if;
  if exists (select 1 from pg_policies where tablename like 'runtime_%' and cmd <> 'SELECT') then
    raise exception 'unexpected non-select policy on gateway tables';
  end if;
end $$;

-- authenticated (non-admin) and anon see nothing and cannot write
set role authenticated;
do $$ begin
  if (select count(*) from public.runtime_deployments) <> 0 then raise exception 'non-admin can read deployments'; end if;
end $$;
do $$ begin
  insert into public.runtime_gateway_events (type, actor) values ('x', 'attacker');
  raise exception 'expected permission denied';
exception when insufficient_privilege then null; end $$;
reset role;
set role anon;
do $$ begin
  perform 1 from public.runtime_execution_grants;
  raise exception 'expected permission denied';
exception when insufficient_privilege then null; end $$;
reset role;

select 'migration 0026 validation passed' as result;
