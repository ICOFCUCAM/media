-- Cineforge — schema part 60: the Ads Studio's brief in production (docs/47;
-- A2 website intelligence, A3 brand assets).
--
--  projects.ad_source  what the Ads Studio read from the advertiser's page:
--                      its URL, title and brand, and the source facts
--                      (product, benefits, audience, call to action), each
--                      with the passage quoted from the page. The Director
--                      plans an advert from them and flags any line that
--                      claims more than they support.
--  brand_assets        the advertiser's own files for one advert: a logo,
--                      added exactly as supplied on the closing card, and
--                      product photographs, the references the stills of
--                      shots showing the product are drawn from. The owner
--                      adds them while the advert waits as DRAFT (like a
--                      cast); the worker reads them. Files live in the asset
--                      bucket under brand/<the owner's id>/.

alter table public.projects add column if not exists ad_source jsonb;
alter table public.projects drop constraint if exists projects_ad_source_check;
alter table public.projects add constraint projects_ad_source_check check (
  ad_source is null or (
    jsonb_typeof(ad_source) = 'object'
    and jsonb_typeof(coalesce(ad_source -> 'facts', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(ad_source -> 'facts', '[]'::jsonb)) <= 12
    and pg_column_size(ad_source) <= 32768
  )
);

create table public.brand_assets (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  role         text not null check (role in ('logo', 'product')),
  storage_key  text not null check (storage_key ~ '^brand/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'),
  name         text not null default '' check (length(name) <= 200),
  mime         text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  bytes        integer not null check (bytes between 1 and 15728640),
  created_at   timestamptz not null default now(),
  -- The file is in its owner's folder.
  check (split_part(storage_key, '/', 2) = user_id::text)
);
create index brand_assets_project_idx on public.brand_assets (project_id, created_at);
create unique index brand_assets_project_key on public.brand_assets (project_id, storage_key);
create unique index brand_assets_one_logo on public.brand_assets (project_id) where role = 'logo';
alter table public.brand_assets enable row level security;
create policy brand_assets_owner on public.brand_assets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.owns_project(project_id));
revoke all on public.brand_assets from anon;
revoke update on public.brand_assets from authenticated;
grant select, insert, delete on public.brand_assets to authenticated;

-- A client adds files only to its own advert, before it is queued, and at most
-- eight product photographs. Invoker rights: current_user must be the caller.
create or replace function public.guard_brand_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if not exists (
      select 1 from public.projects p
      where p.id = new.project_id and p.user_id = new.user_id and p.kind = 'advert' and p.status::text = 'DRAFT'
    ) then
      raise exception 'brand files are added to your own advert before it is queued' using errcode = '42501';
    end if;
    if new.role = 'product' and (
      select count(*) from public.brand_assets b where b.project_id = new.project_id and b.role = 'product'
    ) >= 8 then
      raise exception 'at most 8 product photographs per advert' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_brand_asset() from public;
create trigger brand_assets_guard before insert on public.brand_assets
  for each row execute function public.guard_brand_asset();

-- Owner folders in the asset bucket (0059) gain brand/<the owner's id>/… for
-- the Ads Studio's uploads. Same four policies, one more folder (Supabase
-- storage only; skipped where there is none, as in the CI stub database).
do $do$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute $p$drop policy if exists "cineforge owner folders read" on storage.objects$p$;
  execute $p$drop policy if exists "cineforge owner folders insert" on storage.objects$p$;
  execute $p$drop policy if exists "cineforge owner folders update" on storage.objects$p$;
  execute $p$drop policy if exists "cineforge owner folders delete" on storage.objects$p$;
  execute $p$create policy "cineforge owner folders read" on storage.objects for select to authenticated using (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'voiceovers', 'talk', 'brand')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute $p$create policy "cineforge owner folders insert" on storage.objects for insert to authenticated with check (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'talk', 'brand')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute $p$create policy "cineforge owner folders update" on storage.objects for update to authenticated using (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'talk', 'brand')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute $p$create policy "cineforge owner folders delete" on storage.objects for delete to authenticated using (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'voiceovers', 'talk', 'brand')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
end
$do$;
