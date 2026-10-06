-- Cineforge — schema part 27: content-addressed LoRAs (docs/39 §9.1, authz v2).
-- A character's LoRA is bound by storage key AND content hash; the GPU worker
-- refuses bytes that do not match. The hash is written only by the worker
-- (direct connection) — never by clients, who can otherwise write their own
-- project's storage and would be able to make a swapped file "match".
-- Applied with the same procedure as 0026 (docs/39 §10 step 0).

alter table public.characters
  add column if not exists lora_sha256 text
  check (lora_sha256 is null or lora_sha256 ~ '^[0-9a-f]{64}$');

create or replace function public.guard_character_lora_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Clients (and non-admins) may not set or change LoRA identity.
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if (tg_op = 'INSERT' and (new.lora_key is not null or new.lora_version is not null or new.lora_sha256 is not null))
       or (tg_op = 'UPDATE' and (new.lora_key is distinct from old.lora_key
                                 or new.lora_version is distinct from old.lora_version
                                 or new.lora_sha256 is distinct from old.lora_sha256)) then
      raise exception 'LoRA fields are set by the server only' using errcode = '42501';
    end if;
  end if;
  -- A new artifact invalidates the old hash unless a new one comes with it:
  -- an unhashed LoRA is refused under enforcement, never trusted.
  if tg_op = 'UPDATE' and new.lora_key is distinct from old.lora_key
     and new.lora_sha256 is not distinct from old.lora_sha256 then
    new.lora_sha256 := null;
  end if;
  return new;
end;
$$;

create or replace trigger characters_guard_lora_columns before insert or update on public.characters
  for each row execute function public.guard_character_lora_columns();
