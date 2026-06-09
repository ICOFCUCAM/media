-- Cineforge — Supabase schema, part 4: Realtime + Storage.

-- ─── Realtime ───────────────────────────────────────────
-- The Studio subscribes to a project's progress. Postgres Changes on these
-- tables replace the Redis->Socket.IO fan-out for client-facing updates
-- (the worker still uses Redis/BullMQ internally). RLS applies to Realtime,
-- so a user only receives changes for rows they own.
alter table public.projects    replica identity full;
alter table public.scenes      replica identity full;
alter table public.shots       replica identity full;
alter table public.render_jobs replica identity full;
alter table public.films       replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.projects;
  alter publication supabase_realtime add table public.scenes;
  alter publication supabase_realtime add table public.shots;
  alter publication supabase_realtime add table public.render_jobs;
  alter publication supabase_realtime add table public.films;
exception when duplicate_object then null; end $$;

-- ─── Storage ────────────────────────────────────────────
-- Single private bucket; DB stores keys, never blobs (docs/14-storage.md).
-- Layout: projects/{projectId}/...  -> foldername[1]='projects', [2]=projectId.
insert into storage.buckets (id, name, public)
values ('cineforge-assets', 'cineforge-assets', false)
on conflict (id) do nothing;

-- Owners may read/write only within their own project's prefix. Service-role
-- workers bypass RLS for generated assets.
create policy "cineforge owner read" on storage.objects
  for select to authenticated using (
    bucket_id = 'cineforge-assets'
    and (storage.foldername(name))[1] = 'projects'
    and public.owns_project(((storage.foldername(name))[2])::uuid)
  );

create policy "cineforge owner insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'cineforge-assets'
    and (storage.foldername(name))[1] = 'projects'
    and public.owns_project(((storage.foldername(name))[2])::uuid)
  );

create policy "cineforge owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'cineforge-assets'
    and (storage.foldername(name))[1] = 'projects'
    and public.owns_project(((storage.foldername(name))[2])::uuid)
  );

create policy "cineforge owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'cineforge-assets'
    and (storage.foldername(name))[1] = 'projects'
    and public.owns_project(((storage.foldername(name))[2])::uuid)
  );
