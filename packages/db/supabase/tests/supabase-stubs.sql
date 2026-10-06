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
