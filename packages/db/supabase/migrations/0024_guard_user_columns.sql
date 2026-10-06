-- Cineforge — schema part 24: users may edit their own profile, never their
-- own role, plan or balance. users_self_update covers the whole row and the
-- column grants include role/tier/credits_ms, so without this any signed-in
-- user could promote themselves. Admins (the credits console) and the service
-- role are not restricted. Applied live as "revoke_anon_admin_rpcs" +
-- "guard_user_columns".

-- Admin RPCs check is_admin() inside, but signed-out callers have no business here.
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.grant_credits(text, int) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.grant_credits(text, int) to authenticated;
revoke update on public.users from anon;

create or replace function public.guard_user_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.tier is distinct from old.tier
       or new.credits_ms is distinct from old.credits_ms
       or new.stripe_id is distinct from old.stripe_id
       or new.created_at is distinct from old.created_at then
      raise exception 'only display_name and notify_on_finish can be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger users_guard_columns before update on public.users
  for each row execute function public.guard_user_columns();
