-- Cineforge — schema part 63: provenance of stills drawn by CineForge's own
-- image runtime (ComfyUI behind the Media Runtime Gateway; docs/73,
-- docs/38 §AT.8 step 6, §AT.12).
--
--  image_generations   gains, for stills drawn by a workflow runtime, the
--                      registry workflow that drew it (id, version and the
--                      sha256 of its graph + slots) and the runtime with its
--                      version (e.g. comfyui@<commit>). All four are null for
--                      providers that run no CineForge workflow (openai, fal).
--                      The table stays append-only (0052's trigger compares
--                      whole rows, so these columns are covered).
--
-- No new table: deployments, grants and audit events of the image runtime live
-- in runtime_deployments / runtime_execution_grants / runtime_gateway_events
-- (0026) with scope 'image:run'.

alter table public.image_generations
  add column if not exists runtime          text check (runtime is null or length(runtime) between 1 and 128),
  add column if not exists workflow_id      text check (workflow_id is null or workflow_id ~ '^[a-z][a-z0-9.-]{2,63}$'),
  add column if not exists workflow_version int  check (workflow_version is null or workflow_version >= 1),
  add column if not exists workflow_sha256  text check (workflow_sha256 is null or workflow_sha256 ~ '^[0-9a-f]{64}$');

-- A workflow is named in full or not at all, and only with the runtime that ran it.
alter table public.image_generations drop constraint if exists image_generations_workflow_complete;
alter table public.image_generations add constraint image_generations_workflow_complete check (
  (workflow_id is null and workflow_version is null and workflow_sha256 is null)
  or (workflow_id is not null and workflow_version is not null and workflow_sha256 is not null and runtime is not null)
);

create index if not exists image_generations_workflow_idx on public.image_generations (workflow_id, workflow_version)
  where workflow_id is not null;
