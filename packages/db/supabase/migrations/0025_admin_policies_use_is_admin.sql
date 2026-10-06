-- Cineforge — schema part 25: admin checks go through public.is_admin()
-- (SECURITY DEFINER, reads users without RLS). The inline
-- "exists (select from users ...)" checks from 0016/0020/0021 recursed through
-- users' own policies and failed every signed-in read of users. Scoped to
-- authenticated so signed-out visitors never evaluate them.
-- Applied live as "admin_policies_use_is_admin" + "showcase_bucket_policies_use_is_admin".
alter policy users_admin_read on public.users to authenticated
  using ((select public.is_admin()));
alter policy users_admin_update on public.users to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy voices_admin on public.voices to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy showcase_admin_write on public.showcase to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter policy "admin write showcase bucket" on storage.objects to authenticated
  with check (bucket_id = 'cineforge-public' and (select public.is_admin()));
alter policy "admin delete showcase bucket" on storage.objects to authenticated
  using (bucket_id = 'cineforge-public' and (select public.is_admin()));
