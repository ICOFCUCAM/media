-- Minimal stand-ins for the Supabase objects migration 0026 depends on, so it
-- can be validated against a plain Postgres in CI.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
-- Minimal characters table (real definition: 0002) for validating 0027.
create table if not exists public.characters (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  name         text not null,
  appearance   text not null,
  lora_key     text,
  lora_version text
);
grant select, insert, update, delete on public.characters to anon, authenticated;
-- Minimal auth + projects for 0028–0030 (real: Supabase auth, 0002, 0003).
-- auth.uid() reads a test setting so RLS can be exercised as a given user.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
create table if not exists public.projects (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title   text not null default 'p'
);
grant select, insert, update, delete on public.projects to anon, authenticated;
create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade
);
create or replace function public.owns_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and user_id = auth.uid());
$$;
grant execute on function public.owns_project(uuid) to authenticated;
