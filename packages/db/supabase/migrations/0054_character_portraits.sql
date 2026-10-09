-- Cineforge — schema part 54: Character Card portraits (DirectorOS W21; Part 5
-- §183 "a reusable Character Card: image, voice, style, …").
--
--  characters.portrait_*  the card's generated portrait. The owner asks for
--                         one (portrait_status = 'requested'); the worker
--                         draws it with the image engine and writes the key.
--                         Clients can only request: the key, the error and
--                         the other statuses are written by the server.
--  image_generations      gains the purpose 'portrait' (the still is on record
--                         like every other, W17).

alter table public.characters
  add column if not exists portrait_key text check (portrait_key is null or length(portrait_key) between 1 and 512),
  add column if not exists portrait_status text check (portrait_status is null or portrait_status in ('requested', 'generating', 'ready', 'failed')),
  add column if not exists portrait_error text check (portrait_error is null or length(portrait_error) <= 500);

create or replace function public.guard_character_portrait_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    -- A client may only ask for a portrait (or ask again); never write the result.
    if (tg_op = 'INSERT' and (new.portrait_key is not null or new.portrait_error is not null
                              or (new.portrait_status is not null and new.portrait_status <> 'requested')))
       or (tg_op = 'UPDATE' and (new.portrait_key is distinct from old.portrait_key
                                 or new.portrait_error is distinct from old.portrait_error
                                 or (new.portrait_status is distinct from old.portrait_status and new.portrait_status is distinct from 'requested')
                                 or (new.portrait_status = 'requested' and old.portrait_status = 'generating'))) then
      raise exception 'portraits are drawn by the server; a client can only request one' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger characters_guard_portrait_columns before insert or update on public.characters
  for each row execute function public.guard_character_portrait_columns();

revoke all on function public.guard_character_portrait_columns() from public, anon, authenticated;

create index if not exists characters_portrait_requested_idx on public.characters (portrait_status) where portrait_status = 'requested';

alter table public.image_generations drop constraint if exists image_generations_purpose_check;
alter table public.image_generations add constraint image_generations_purpose_check
  check (purpose in ('seed_frame', 'seed_candidate', 'wardrobe_reference', 'location_reference', 'prop_reference', 'portrait'));
