-- Cineforge — schema part 20: admin console reads the roster and adjusts
-- tiers/credits. Applied live as "admin_policies".
-- NOTE: these inline checks read users from inside users' own policies and
-- recurse; 0025 rewrites them to use is_admin(). Kept as applied.
create policy users_admin_read on public.users for select using (
  exists (select 1 from public.users me where me.id = auth.uid() and me.role = 'ADMIN')
);
create policy users_admin_update on public.users for update using (
  exists (select 1 from public.users me where me.id = auth.uid() and me.role = 'ADMIN')
);
