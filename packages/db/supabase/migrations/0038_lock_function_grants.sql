-- Cineforge — schema part 38: tighten 0037. `scene_is_locked` is only for the
-- lock triggers; signed-in users cannot call it over the API. The trigger
-- functions run as their owner so they can still check locks.

alter function public.guard_locked_scene_child() security definer;
alter function public.guard_scene_lock() security definer;
alter function public.guard_project_lock() security definer;
revoke all on function public.scene_is_locked(uuid) from public, anon, authenticated;
revoke all on function public.guard_locked_scene_child() from public, anon, authenticated;
revoke all on function public.guard_scene_lock() from public, anon, authenticated;
revoke all on function public.guard_project_lock() from public, anon, authenticated;
