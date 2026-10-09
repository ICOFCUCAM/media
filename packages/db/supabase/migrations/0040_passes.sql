-- Cineforge — schema part 40: production passes (DirectorOS W8b; Part 2 §87–88).
--
-- A three-pass production runs STORY → PREVIS → FINAL:
--   STORY   the Director's plan (scenes, dialogue, shots) waits for the
--           owner (project status REVIEW) until the story is approved;
--   PREVIS  storyboard stills are drawn for every shot — no video — and
--           each scene waits until its storyboard is approved;
--   FINAL   only approved scenes generate video; the film renders when
--           every scene is done.
-- A single-pass production (the default, as before) goes straight through.
--
-- The rule that matters is enforced here: in a three-pass production no shot
-- of an unapproved scene can enter video generation, whatever code path tries.

alter type public.project_status add value if not exists 'REVIEW';

alter table public.projects
  add column if not exists pass_mode text not null default 'single' check (pass_mode in ('single', 'three')),
  add column if not exists story_approved_at timestamptz,
  add column if not exists previs_started_at timestamptz;
alter table public.scenes
  add column if not exists storyboard_approved_at timestamptz;

-- Video for a shot only when its scene's storyboard is approved (three-pass).
create or replace function public.guard_pass_shot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text in ('QUEUED', 'GENERATING', 'UPLOADED', 'QC_PASS', 'QC_FAIL', 'READY')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and exists (
       select 1 from public.scenes sc join public.projects p on p.id = sc.project_id
       where sc.id = new.scene_id and p.pass_mode = 'three' and sc.storyboard_approved_at is null
     ) then
    raise exception 'scene storyboard not approved: no video until it is (three-pass production)' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger shots_pass_guard before insert or update of status on public.shots
  for each row execute function public.guard_pass_shot();

-- A scene's storyboard is approved only after the story; it cannot be withdrawn while its video is being made.
create or replace function public.guard_scene_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.storyboard_approved_at is null and new.storyboard_approved_at is not null then
    if not exists (select 1 from public.projects where id = new.project_id and pass_mode = 'three' and story_approved_at is not null) then
      raise exception 'approve the story before a storyboard' using errcode = '23514';
    end if;
  elsif old.storyboard_approved_at is not null and new.storyboard_approved_at is null then
    if exists (select 1 from public.shots where scene_id = new.id and status::text in ('QUEUED', 'GENERATING', 'UPLOADED')) then
      raise exception 'scene % is generating: its storyboard approval cannot be withdrawn now', new.id using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger scenes_approval_guard before update of storyboard_approved_at on public.scenes
  for each row execute function public.guard_scene_approval();

-- The story is approved only once planned; withdrawn only before any storyboard is; the pass mode is fixed once planned.
create or replace function public.guard_project_passes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pass_mode is distinct from old.pass_mode and exists (select 1 from public.scenes where project_id = new.id) then
    raise exception 'the pass mode is fixed once the film is planned' using errcode = '42501';
  end if;
  if old.story_approved_at is null and new.story_approved_at is not null then
    if new.pass_mode <> 'three' or not exists (select 1 from public.scenes where project_id = new.id) then
      raise exception 'only a planned three-pass production has a story to approve' using errcode = '23514';
    end if;
  elsif old.story_approved_at is not null and new.story_approved_at is null then
    if exists (select 1 from public.scenes where project_id = new.id and storyboard_approved_at is not null) then
      raise exception 'storyboards are already approved: the story approval cannot be withdrawn' using errcode = '42501';
    end if;
    new.previs_started_at := null;
  end if;
  return new;
end;
$$;
create trigger projects_passes_guard before update of pass_mode, story_approved_at on public.projects
  for each row execute function public.guard_project_passes();

revoke all on function public.guard_pass_shot() from public, anon, authenticated;
revoke all on function public.guard_scene_approval() from public, anon, authenticated;
revoke all on function public.guard_project_passes() from public, anon, authenticated;
