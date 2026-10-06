-- Minimal stand-ins for the Supabase objects migration 0026 depends on, so it
-- can be validated against a plain Postgres in CI.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
