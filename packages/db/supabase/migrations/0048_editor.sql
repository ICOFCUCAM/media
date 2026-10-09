-- Cineforge — schema part 48: the Editor Agent (DirectorOS W13; Part 1 §21, §46).
--
--  editorial_reviews  the Editor reviews a finished cut as a whole (the nine
--                     questions of §21.1), or answers one editing request
--                     ("make the opening 15 seconds faster", §46). Owners file
--                     a review; the worker writes the findings and proposals.
--  edit_proposals     structured edit operations (§21.2–21.3) — CUT_SHOT,
--                     TRIM_SHOT, EXTEND_SHOT, SHORTEN_SCENE, MOVE_SCENE,
--                     ADD_INSERT, REMOVE_LINE — each dry-run against the film
--                     with its cost (re-cut, regenerate, remove, re-voice).
--  shots.cut_sec      the editor's cut length: the render trims the shot's
--                     clip to it, so a trim never regenerates anything.
--
-- Review: pending → reviewing → ready → apply_requested → applying →
-- applied | failed (failed may also follow pending/reviewing). The owner
-- approves or rejects proposals and asks for the approved ones to be applied
-- through two owner-checked functions; everything else is the worker's.

create table public.editorial_reviews (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  requested_by   uuid,
  instruction    text check (instruction is null or length(instruction) between 1 and 2000),
  status         text not null default 'pending'
                   check (status in ('pending', 'reviewing', 'ready', 'apply_requested', 'applying', 'applied', 'failed')),
  canon_version  text check (canon_version is null or length(canon_version) <= 64),
  summary        text check (summary is null or length(summary) <= 2000),
  findings       jsonb not null default '[]' check (jsonb_typeof(findings) = 'array'),
  dropped        jsonb not null default '[]' check (jsonb_typeof(dropped) = 'array'),
  applied_version text check (applied_version is null or length(applied_version) <= 64),
  error          text check (error is null or length(error) <= 1000),
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  applied_at     timestamptz
);
create index editorial_reviews_project_idx on public.editorial_reviews (project_id, created_at);
create index editorial_reviews_work_idx on public.editorial_reviews (status) where status in ('pending', 'apply_requested');

create table public.edit_proposals (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references public.editorial_reviews (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  position     int not null check (position >= 0),
  op           jsonb not null check (
                 jsonb_typeof(op) = 'object'
                 and op ->> 'op' in ('CUT_SHOT', 'TRIM_SHOT', 'EXTEND_SHOT', 'SHORTEN_SCENE', 'MOVE_SCENE', 'ADD_INSERT', 'REMOVE_LINE')
                 and length(op::text) <= 2000),
  description  text not null check (length(description) between 1 and 300),
  effect       jsonb not null default '{}' check (jsonb_typeof(effect) = 'object'),
  status       text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'applied', 'failed')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (review_id, position)
);
create index edit_proposals_review_idx on public.edit_proposals (review_id, position);

create or replace function public.editorial_reviews_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id or new.requested_by is distinct from old.requested_by
     or new.instruction is distinct from old.instruction then
    raise exception 'a review keeps its project, requester and request' using errcode = '42501';
  end if;
  if old.status in ('applied', 'failed') and new.status <> old.status then
    raise exception 'review % is %; finished reviews are final', old.id, old.status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger editorial_reviews_guard before update on public.editorial_reviews
  for each row execute function public.editorial_reviews_guard();

create or replace function public.edit_proposals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.review_id <> old.review_id or new.project_id <> old.project_id or new.op <> old.op or new.position <> old.position then
    raise exception 'a proposal keeps its review, operation and place' using errcode = '42501';
  end if;
  if old.status in ('applied', 'failed') and new.status <> old.status then
    raise exception 'proposal % is %; finished proposals are final', old.id, old.status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger edit_proposals_guard before update on public.edit_proposals
  for each row execute function public.edit_proposals_guard();

alter table public.editorial_reviews enable row level security;
alter table public.edit_proposals enable row level security;
create policy editorial_reviews_owner_read on public.editorial_reviews
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy editorial_reviews_owner_insert on public.editorial_reviews
  for insert to authenticated
  with check ((select public.owns_project(project_id)) and status = 'pending' and requested_by = (select auth.uid())
              and canon_version is null and summary is null and findings = '[]'::jsonb and dropped = '[]'::jsonb
              and applied_version is null and error is null and reviewed_at is null and applied_at is null);
create policy edit_proposals_owner_read on public.edit_proposals
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
revoke all on public.editorial_reviews, public.edit_proposals from anon;
revoke update, delete on public.editorial_reviews from authenticated;
revoke insert, update, delete on public.edit_proposals from authenticated;

-- The owner's two decisions, checked here rather than by column grants.
create or replace function public.decide_edit_proposal(p_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select p.status into v_status
    from public.edit_proposals p join public.editorial_reviews r on r.id = p.review_id
   where p.id = p_id and r.status = 'ready' and public.owns_project(p.project_id);
  if v_status is null then
    raise exception 'no open proposal % of yours', p_id using errcode = '42501';
  end if;
  update public.edit_proposals
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
   where id = p_id;
  return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

create or replace function public.request_editorial_apply(p_review uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.editorial_reviews r where r.id = p_review and r.status = 'ready' and public.owns_project(r.project_id)) then
    raise exception 'no ready review % of yours', p_review using errcode = '42501';
  end if;
  if not exists (select 1 from public.edit_proposals p where p.review_id = p_review and p.status = 'approved') then
    raise exception 'approve at least one proposal first' using errcode = '22023';
  end if;
  update public.editorial_reviews set status = 'apply_requested' where id = p_review;
  return 'apply_requested';
end;
$$;

revoke execute on function public.decide_edit_proposal(uuid, boolean), public.request_editorial_apply(uuid) from public, anon;
grant execute on function public.decide_edit_proposal(uuid, boolean), public.request_editorial_apply(uuid) to authenticated;
revoke execute on function public.editorial_reviews_guard(), public.edit_proposals_guard() from public, anon, authenticated;

-- The editor's cut length for a shot (seconds): the render trims the clip to it.
alter table public.shots add column if not exists cut_sec numeric(6, 3) check (cut_sec is null or cut_sec > 0);

-- Scene snapshots taken before an editorial apply (0041).
alter table public.scene_versions drop constraint if exists scene_versions_reason_check;
alter table public.scene_versions add constraint scene_versions_reason_check check (reason in ('replan', 'canon_edit', 'editorial'));
