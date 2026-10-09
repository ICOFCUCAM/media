-- Cineforge — schema part 52: the Image Engine's record (DirectorOS W17;
-- Part 2 §69, §95; Part 1 §15, §34–35).
--
--  image_generations   one row per still CineForge generates — seed frames,
--                      seed candidates, wardrobe / location / prop references —
--                      with the provider, the model, the seed it was drawn
--                      with (null when the provider takes none), the prompt's
--                      sha256, the size, the stored object's sha256 and the
--                      canon digest it depicts. Append-only, except which
--                      candidate is chosen.
--  world_references    one reference still per (place or prop, canon digest),
--                      like wardrobe_references (0034): a canon change gives a
--                      new digest and a new still; unchanged canon reuses it.
--  choose_seed_candidate(id)  the owner picks a different candidate still for
--                      a shot that has no video yet (storyboard / previs).

create table public.image_generations (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  purpose        text not null check (purpose in ('seed_frame', 'seed_candidate', 'wardrobe_reference', 'location_reference', 'prop_reference')),
  -- The shot id, wardrobe key, location id or prop id the still is for.
  subject        text not null check (length(subject) between 1 and 128),
  provider       text not null check (length(provider) between 1 and 64),
  model          text check (model is null or length(model) between 1 and 128),
  seed           bigint,
  prompt_sha256  text not null check (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  width          int check (width is null or width > 0),
  height         int check (height is null or height > 0),
  storage_key    text not null,
  sha256         text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  canon_digest   text check (canon_digest is null or canon_digest ~ '^[0-9a-f]{64}$'),
  candidate      int check (candidate is null or candidate between 0 and 15),
  chosen         boolean,
  created_at     timestamptz not null default now(),
  constraint image_generations_candidate_pair check ((purpose = 'seed_candidate') = (candidate is not null))
);
create index image_generations_project_idx on public.image_generations (project_id, purpose);
create index image_generations_subject_idx on public.image_generations (subject, purpose);

create or replace function public.image_generations_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'image_generations is append-only' using errcode = '42501'; end if;
  -- Only which candidate is chosen may change.
  if (to_jsonb(new) - 'chosen') is distinct from (to_jsonb(old) - 'chosen') then
    raise exception 'image_generations is append-only (only chosen may change)' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger image_generations_append_only before update or delete on public.image_generations
  for each row execute function public.image_generations_append_only();

alter table public.image_generations enable row level security;
create policy image_generations_owner_read on public.image_generations for select using (public.owns_project(project_id));
revoke insert, update, delete on public.image_generations from anon, authenticated;
grant select on public.image_generations to authenticated;

create table public.world_references (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  kind         text not null check (kind in ('location', 'prop')),
  ref_key      text not null check (ref_key ~ '^(loc|prop)_[a-z0-9_]{1,60}$'),
  digest       text not null check (digest ~ '^[0-9a-f]{64}$'),
  storage_key  text not null,
  provider     text not null check (length(provider) between 1 and 64),
  created_at   timestamptz not null default now(),
  unique (project_id, kind, ref_key, digest)
);
create or replace function public.world_references_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'world_references is append-only' using errcode = '42501';
end $$;
create trigger world_references_append_only before update or delete on public.world_references
  for each row execute function public.world_references_append_only();
alter table public.world_references enable row level security;
create policy world_references_owner_read on public.world_references for select using (public.owns_project(project_id));
revoke insert, update, delete on public.world_references from anon, authenticated;
grant select on public.world_references to authenticated;

create or replace function public.choose_seed_candidate(p_generation uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  g public.image_generations;
  s record;
begin
  select * into g from public.image_generations where id = p_generation;
  if not found or g.purpose <> 'seed_candidate' then
    raise exception 'not a seed candidate' using errcode = 'P0002';
  end if;
  if not public.owns_project(g.project_id) then
    raise exception 'not your production' using errcode = '42501';
  end if;
  select sh.id, sh.video_key into s from public.shots sh
    join public.scenes sc on sc.id = sh.scene_id
    where sh.id::text = g.subject and sc.project_id = g.project_id;
  if not found then raise exception 'the shot no longer exists' using errcode = 'P0002'; end if;
  if s.video_key is not null then
    raise exception 'this shot already has its video; regenerate the shot to change its still' using errcode = '55000';
  end if;
  update public.shots set seed_image_key = g.storage_key where id = s.id;
  update public.image_generations set chosen = (id = g.id)
    where subject = g.subject and purpose = 'seed_candidate' and project_id = g.project_id;
  return g.storage_key;
end $$;
revoke all on function public.choose_seed_candidate(uuid) from public;
revoke execute on function public.choose_seed_candidate(uuid) from anon;
grant execute on function public.choose_seed_candidate(uuid) to authenticated;
revoke execute on function public.image_generations_append_only(), public.world_references_append_only() from public, anon, authenticated;
