-- Validation for migration 0027 (CI job migration-0026, scratch Postgres).
\set ON_ERROR_STOP on

insert into public.characters (id, project_id, name, appearance) values ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Amara', 'x');

-- server sets key + hash together
update public.characters set lora_key = 'projects/p/identities/c/v1/lora.safetensors', lora_sha256 = repeat('ab', 32)
 where id = '00000000-0000-0000-0000-000000000001';

-- must fail: not a sha256
do $$ begin
  update public.characters set lora_sha256 = 'not-a-hash' where id = '00000000-0000-0000-0000-000000000001';
  raise exception 'expected check violation';
exception when check_violation then null; end $$;

-- a new artifact without a new hash clears the stale hash
update public.characters set lora_key = 'projects/p/identities/c/v2/lora.safetensors' where id = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select lora_sha256 from public.characters where id = '00000000-0000-0000-0000-000000000001') is not null then
    raise exception 'stale hash kept after lora_key change';
  end if;
end $$;

-- clients cannot set or change LoRA identity
set role authenticated;
do $$ begin
  update public.characters set lora_sha256 = repeat('cd', 32) where id = '00000000-0000-0000-0000-000000000001';
  raise exception 'expected permission error';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.characters (project_id, name, appearance, lora_key) values (gen_random_uuid(), 'x', 'y', 'projects/x/l.safetensors');
  raise exception 'expected permission error';
exception when insufficient_privilege then null; end $$;
-- other fields stay editable by clients
update public.characters set appearance = 'tall' where id = '00000000-0000-0000-0000-000000000001';
reset role;

select 'migration 0027 validation passed' as result;
