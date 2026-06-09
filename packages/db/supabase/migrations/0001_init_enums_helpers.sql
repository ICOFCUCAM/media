-- Cineforge — Supabase schema, part 1: extensions, enums, helper functions.
-- Source of truth for the pivot to Supabase (DB/Auth/Realtime/Storage).
-- Mirrors packages/db/prisma/schema.prisma + docs/02-database-schema.md, but
-- adapted to Supabase conventions: uuid PKs, public.users linked to auth.users,
-- snake_case identifiers, and Row-Level Security keyed on auth.uid().

-- ─── Extensions ─────────────────────────────────────────
create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists vector;         -- identity embeddings (docs/24 §C3)

-- ─── Enums (match Prisma values) ────────────────────────
do $$ begin
  create type tier as enum ('FREE', 'CREATOR', 'STUDIO', 'ENTERPRISE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type role as enum ('USER', 'ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum
    ('DRAFT', 'PLANNING', 'GENERATING', 'RENDERING', 'PAUSED', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type location_kind as enum
    ('CITY', 'KINGDOM', 'BUILDING', 'ROOM', 'LANDSCAPE', 'INTERIOR', 'EXTERIOR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scene_status as enum
    ('PENDING', 'PROMPTING', 'GENERATING', 'AUDIO', 'QC', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shot_status as enum
    ('PENDING', 'QUEUED', 'GENERATING', 'UPLOADED', 'QC_PASS', 'QC_FAIL', 'READY', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type audio_kind as enum ('VOICE', 'MUSIC', 'SFX', 'AMBIENCE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type render_status as enum
    ('QUEUED', 'ASSEMBLING', 'TRANSCODING', 'DONE', 'FAILED');
exception when duplicate_object then null; end $$;

-- ─── Trigger: keep updated_at fresh ─────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Trigger: mirror auth.users -> public.users profile ─
-- Supabase Auth owns credentials; the app keeps profile/billing fields here.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- NOTE: ownership helper functions (owns_project/owns_scene/…/is_admin) are
-- defined in 0003_init_rls.sql, after the tables they reference exist —
-- SQL-language function bodies are validated at creation time.
