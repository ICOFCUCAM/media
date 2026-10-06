-- Cineforge — schema part 13: beta credits (applied live as "credits_beta_kit").
-- Signup grant + admin grant/list functions.

-- 1) New signups start with 60 GPU-minutes of free credits (enough for a
--    first short film) instead of 0, which would hard-block them at the gate.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.users (id, email, display_name, credits_ms)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name'),
    3600000 -- 60 GPU-minutes starter grant
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2) Admin-only credit grant (positive or negative minutes). SECURITY DEFINER
--    so it can bypass RLS, but it refuses unless the CALLER is an admin.
create or replace function public.grant_credits(target_email text, minutes int)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare new_balance bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.users
     set credits_ms = greatest(0, credits_ms + minutes * 60000)
   where email = target_email
  returning credits_ms into new_balance;
  if new_balance is null then
    raise exception 'no user with email %', target_email;
  end if;
  return new_balance;
end;
$$;
revoke all on function public.grant_credits(text, int) from public;
grant execute on function public.grant_credits(text, int) to authenticated;

-- 3) Admin-only user list for the credits console.
create or replace function public.admin_list_users()
returns table (id uuid, email text, tier text, credits_ms int, role text, created_at timestamptz, projects bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  return query
    select u.id, u.email, u.tier::text, u.credits_ms, u.role::text, u.created_at,
           (select count(*) from public.projects p where p.user_id = u.id and p.mode <> 'library')
    from public.users u
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;
