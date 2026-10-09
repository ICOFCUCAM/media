-- Cineforge — schema part 37: scene and film locks (DirectorOS W8; Part 2 §86).
--
-- A locked scene is final: its shots, dialogue lines and audio tracks cannot
-- be added, changed or removed — by the worker, a canon edit or a client —
-- until its owner unlocks it. A locked film (projects.locked_at) locks every
-- scene in it. A scene can be locked only when every shot in it is ready with
-- a clip, so a lock always freezes something finished.
--
-- Enforced here, in the database, so no code path can bypass it. Deleting the
-- whole project still cascades.

alter table public.scenes
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid;
alter table public.projects
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid;

create or replace function public.scene_is_locked(s uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.scenes sc join public.projects p on p.id = sc.project_id
    where sc.id = s and (sc.locked_at is not null or p.locked_at is not null)
  );
$$;
revoke all on function public.scene_is_locked(uuid) from public, anon;
grant execute on function public.scene_is_locked(uuid) to authenticated;

-- Shots, dialogue lines and audio tracks of a locked scene are frozen.
create or replace function public.guard_locked_scene_child()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sid uuid := coalesce(new.scene_id, old.scene_id);
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.scenes where id = old.scene_id) then
    return old;  -- the scene (or project) itself is being deleted
  end if;
  if public.scene_is_locked(sid) or (tg_op = 'UPDATE' and new.scene_id <> old.scene_id and public.scene_is_locked(old.scene_id)) then
    raise exception 'scene % is locked: unlock it to change its %', sid, tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger shots_locked_scene before insert or update or delete on public.shots
  for each row execute function public.guard_locked_scene_child();
create trigger dialogue_lines_locked_scene before insert or update or delete on public.dialogue_lines
  for each row execute function public.guard_locked_scene_child();
create trigger audio_tracks_locked_scene before insert or update or delete on public.audio_tracks
  for each row execute function public.guard_locked_scene_child();

-- A scene: lock only when finished; while locked (or in a locked film) only unlocking is allowed.
create or replace function public.guard_scene_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  film_locked boolean;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.projects where id = old.project_id) then
      return old;  -- project deletion cascades
    end if;
    if old.locked_at is not null or exists (select 1 from public.projects where id = old.project_id and locked_at is not null) then
      raise exception 'scene % is locked: unlock it before deleting it', old.id using errcode = '42501';
    end if;
    return old;
  end if;
  film_locked := exists (select 1 from public.projects where id = new.project_id and locked_at is not null);
  if tg_op = 'INSERT' then
    if film_locked then raise exception 'the film is locked: unlock it to add scenes' using errcode = '42501'; end if;
    if new.locked_at is not null then raise exception 'a new scene cannot start locked' using errcode = '42501'; end if;
    return new;
  end if;
  -- UPDATE (status is pipeline bookkeeping, not content: it may still change)
  if old.locked_at is null and new.locked_at is not null then
    if exists (select 1 from public.shots where scene_id = new.id and (status::text <> 'READY' or video_key is null))
       or not exists (select 1 from public.shots where scene_id = new.id) then
      raise exception 'scene % has shots that are not ready: it can be locked only when finished', new.id using errcode = '23514';
    end if;
    new.locked_by := coalesce(new.locked_by, auth.uid());
    return new;
  end if;
  if old.locked_at is not null and new.locked_at is null then
    if film_locked then raise exception 'the film is locked: unlock the film first' using errcode = '42501'; end if;
    new.locked_by := null;
    return new;  -- unlocking (only the lock columns may change with it)
  end if;
  if (old.locked_at is not null or film_locked)
     and (to_jsonb(new) - 'updated_at' - 'locked_by' - 'status') is distinct from (to_jsonb(old) - 'updated_at' - 'locked_by' - 'status') then
    raise exception 'scene % is locked: unlock it to change it', new.id using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger scenes_lock_guard before insert or update or delete on public.scenes
  for each row execute function public.guard_scene_lock();

-- A film: lock only when every scene is finished; record who locked it.
create or replace function public.guard_project_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.locked_at is null and new.locked_at is not null then
    if exists (
      select 1 from public.shots sh join public.scenes sc on sc.id = sh.scene_id
      where sc.project_id = new.id and (sh.status::text <> 'READY' or sh.video_key is null)
    ) or not exists (select 1 from public.scenes where project_id = new.id) then
      raise exception 'the film has shots that are not ready: it can be locked only when finished' using errcode = '23514';
    end if;
    new.locked_by := coalesce(new.locked_by, auth.uid());
  elsif old.locked_at is not null and new.locked_at is null then
    new.locked_by := null;
  end if;
  return new;
end;
$$;
create trigger projects_lock_guard before update of locked_at on public.projects
  for each row execute function public.guard_project_lock();
