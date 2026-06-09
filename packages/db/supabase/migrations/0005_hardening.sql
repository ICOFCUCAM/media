-- Cineforge — Supabase schema, part 5: security hardening (advisor follow-up).
-- Addresses database-linter findings:
--   * function_search_path_mutable  -> pin search_path on set_updated_at
--   * anon_security_definer_function_executable -> drop PUBLIC/anon EXECUTE on
--     the RLS helpers and the auth trigger fn; re-grant only to `authenticated`
--     (RLS policies target `authenticated`, so anon never needs them, and
--     trigger functions run without a caller EXECUTE check).

alter function public.set_updated_at() set search_path = '';

-- Auth trigger fn: only the trigger invokes it; remove all caller EXECUTE.
revoke execute on function public.handle_new_user() from public;

-- RLS helpers: revoke the implicit PUBLIC grant (removes anon), keep authenticated.
revoke execute on function public.owns_project(uuid)   from public;
revoke execute on function public.owns_scene(uuid)     from public;
revoke execute on function public.owns_character(uuid) from public;
revoke execute on function public.owns_series(uuid)    from public;
revoke execute on function public.owns_season(uuid)    from public;
revoke execute on function public.is_admin()           from public;

grant execute on function public.owns_project(uuid)   to authenticated;
grant execute on function public.owns_scene(uuid)     to authenticated;
grant execute on function public.owns_character(uuid) to authenticated;
grant execute on function public.owns_series(uuid)    to authenticated;
grant execute on function public.owns_season(uuid)    to authenticated;
grant execute on function public.is_admin()           to authenticated;

-- Supabase grants EXECUTE to anon/authenticated explicitly via default
-- privileges, so the PUBLIC revoke above is not enough. Drop anon's grant on
-- every helper (anon satisfies no policy, so it never needs them), and drop the
-- auth trigger fn from both API roles entirely (only the trigger calls it).
-- The remaining `authenticated` EXECUTE on owns_*/is_admin is intentional: RLS
-- evaluates them as the signed-in user, and each only reveals the caller's own
-- ownership. See docs/25-supabase.md.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.owns_project(uuid)   from anon;
revoke execute on function public.owns_scene(uuid)     from anon;
revoke execute on function public.owns_character(uuid) from anon;
revoke execute on function public.owns_series(uuid)    from anon;
revoke execute on function public.owns_season(uuid)    from anon;
revoke execute on function public.is_admin()           from anon;
