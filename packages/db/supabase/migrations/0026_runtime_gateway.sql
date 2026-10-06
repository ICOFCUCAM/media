-- Cineforge — schema part 26: Media Runtime Gateway registry and audit trail
-- (docs/38 §O, §AV.2; docs/39 decision D4). Server-side only: the worker
-- writes through its direct Postgres connection; clients have no write path
-- and only admins can read. No billing table or credit logic changes.
--
--  runtime_deployments        approved GPU deployments: identity, model,
--                             approved manifest and immutable image digest,
--                             enforcement mode.
--  runtime_execution_grants   one row per execution credential issued (or
--                             denied): job, deployment, digest, body hash,
--                             storage keys, outcome. Identity columns are
--                             immutable once written.
--  runtime_gateway_events     append-only security events: denials,
--                             would-deny in report mode, legacy calls,
--                             registrations, enforcement changes.

create table public.runtime_deployments (
  id             text primary key,                      -- DEPLOYMENT_ID on the pod (token aud)
  model_id       text not null,                         -- pod MODEL_NAME ("wan-2.1" | "hunyuan")
  base_url       text not null unique,
  runpod_pod_id  text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  enforcement    text not null default 'report' check (enforcement in ('report', 'enforce')),
  manifest       jsonb,                                 -- approved runtime + models (authz inputs)
  approved_image text check (approved_image is null or approved_image ~ '^[^[:space:]@]+@sha256:[0-9a-f]{64}$'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A deployment can only be enforcing with everything enforcement depends on.
  constraint runtime_deployments_enforce_requires_approval check (
    enforcement = 'report'
    or (status = 'approved' and approved_image is not null and manifest is not null)
  )
);

create table public.runtime_execution_grants (
  id            text primary key,                       -- grant id = token sub = body jobId
  jti           text unique,
  deployment_id text references public.runtime_deployments (id) on delete restrict,
  shot_id       uuid,                                   -- no FK: the audit outlives the shot
  project_id    uuid,
  scope         text not null,
  mode          text not null check (mode in ('report', 'enforce')),
  authz_digest  text,
  body_sha256   text,
  input_keys    text[] not null default '{}',
  output_keys   text[] not null default '{}',
  image_ref     text,
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz,
  outcome       text not null check (outcome in ('issued', 'completed', 'completed_unverified', 'rejected', 'failed', 'denied')),
  error_code    text,
  gpu_ms        integer,
  output_bytes  bigint,
  completed_at  timestamptz
);
create index runtime_execution_grants_shot_idx on public.runtime_execution_grants (shot_id);
create index runtime_execution_grants_deployment_idx on public.runtime_execution_grants (deployment_id, issued_at desc);

create table public.runtime_gateway_events (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  deployment_id text,
  grant_id      text,
  code          text,
  detail        jsonb not null default '{}',
  actor         text not null,
  created_at    timestamptz not null default now()
);
create index runtime_gateway_events_deployment_idx on public.runtime_gateway_events (deployment_id, created_at desc);

-- Audit integrity: events are append-only; a grant's identity never changes
-- after issue (only its outcome fields are filled in).
create or replace function public.runtime_gateway_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'runtime_gateway_events is append-only' using errcode = '42501';
end;
$$;
create trigger runtime_gateway_events_no_update before update or delete on public.runtime_gateway_events
  for each row execute function public.runtime_gateway_events_append_only();

create or replace function public.runtime_execution_grants_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'runtime_execution_grants rows cannot be deleted' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.jti is distinct from old.jti
     or new.deployment_id is distinct from old.deployment_id
     or new.shot_id is distinct from old.shot_id
     or new.project_id is distinct from old.project_id
     or new.scope is distinct from old.scope
     or new.mode is distinct from old.mode
     or new.authz_digest is distinct from old.authz_digest
     or new.body_sha256 is distinct from old.body_sha256
     or new.input_keys is distinct from old.input_keys
     or new.output_keys is distinct from old.output_keys
     or new.image_ref is distinct from old.image_ref
     or new.issued_at is distinct from old.issued_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'only outcome fields of an execution grant can change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger runtime_execution_grants_guard before update or delete on public.runtime_execution_grants
  for each row execute function public.runtime_execution_grants_guard();

-- Every enforcement change is recorded, whoever makes it (admin script or SQL).
create or replace function public.runtime_deployments_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.enforcement is distinct from old.enforcement
                           or new.approved_image is distinct from old.approved_image
                           or new.status is distinct from old.status
                           or new.manifest is distinct from old.manifest) then
    insert into public.runtime_gateway_events (type, deployment_id, code, detail, actor)
    values ('deployment.row_changed', new.id, new.enforcement,
            jsonb_build_object(
              'enforcement', jsonb_build_array(old.enforcement, new.enforcement),
              'status', jsonb_build_array(old.status, new.status),
              'approved_image', jsonb_build_array(old.approved_image, new.approved_image),
              'manifest_changed', new.manifest is distinct from old.manifest),
            current_user);
  end if;
  return new;
end;
$$;
create trigger runtime_deployments_audit before update on public.runtime_deployments
  for each row execute function public.runtime_deployments_audit();

alter table public.runtime_deployments enable row level security;
alter table public.runtime_execution_grants enable row level security;
alter table public.runtime_gateway_events enable row level security;

-- Admins may read; nobody writes through the API (the worker uses its own connection).
create policy runtime_deployments_admin_read on public.runtime_deployments
  for select to authenticated using ((select public.is_admin()));
create policy runtime_execution_grants_admin_read on public.runtime_execution_grants
  for select to authenticated using ((select public.is_admin()));
create policy runtime_gateway_events_admin_read on public.runtime_gateway_events
  for select to authenticated using ((select public.is_admin()));

revoke all on public.runtime_deployments, public.runtime_execution_grants, public.runtime_gateway_events from anon;
revoke insert, update, delete on public.runtime_deployments, public.runtime_execution_grants, public.runtime_gateway_events from authenticated;
