-- Cineforge — schema part 21: homepage showcase — admin-curated real films,
-- publicly viewable. Applied live as "homepage_showcase".
-- (The live migration also raised the superadmin account to ENTERPRISE; that
-- one-off account update is environment data and is not repeated here.)
create table if not exists public.showcase (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  title text not null,
  tag text not null default 'Film',
  video_path text not null,  -- key inside the PUBLIC bucket
  created_at timestamptz not null default now()
);
alter table public.showcase enable row level security;
-- Anyone (incl. anonymous homepage visitors) can read the showcase.
create policy showcase_public_read on public.showcase for select using (true);
-- Only admins curate it. (Rewritten to use is_admin() in 0025.)
create policy showcase_admin_write on public.showcase for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'ADMIN')
);

-- Public bucket for showcase media (the homepage needs URLs that work signed-out).
insert into storage.buckets (id, name, public) values ('cineforge-public', 'cineforge-public', true)
on conflict (id) do update set public = true;
create policy "public read showcase bucket" on storage.objects for select using (bucket_id = 'cineforge-public');
create policy "admin write showcase bucket" on storage.objects for insert with check (
  bucket_id = 'cineforge-public' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'ADMIN')
);
create policy "admin delete showcase bucket" on storage.objects for delete using (
  bucket_id = 'cineforge-public' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'ADMIN')
);
