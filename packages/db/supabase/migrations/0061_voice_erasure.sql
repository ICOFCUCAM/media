-- Cineforge — schema part 61: erasing a deleted voice (DirectorOS W27;
-- Part 3 §110, §118; Part 4 §170).
--
--  voice_erasures  when a voice row is deleted (by its owner in the Voice Lab,
--                  by DELETE /v1/voices/:id, or by an admin), what it leaves
--                  behind is written here before the row and its engine
--                  artifacts are gone: the uploaded recording, every engine
--                  artifact (reference audio, embeddings, adapter weights) and
--                  the provider-side clone. The worker deletes the files and
--                  asks the provider to delete the clone, and records what it
--                  did. Owners may read their own erasures; only the worker
--                  writes.

create table public.voice_erasures (
  id                uuid primary key default gen_random_uuid(),
  voice_id          uuid not null,                       -- the deleted voice (no FK: it is gone)
  user_id           uuid not null references public.users (id) on delete cascade,
  name              text not null default '',
  sample_key        text,
  provider          text,
  provider_voice_id text,
  artifacts         jsonb not null default '[]' check (jsonb_typeof(artifacts) = 'array'),
  status            text not null default 'pending' check (status in ('pending', 'erasing', 'done', 'failed')),
  files_deleted     text[] not null default '{}',
  provider_outcome  text check (provider_outcome is null or provider_outcome in ('deleted', 'none', 'not_supported', 'failed')),
  error             text check (error is null or length(error) <= 2000),
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create index voice_erasures_pending_idx on public.voice_erasures (created_at) where status in ('pending', 'erasing');
create index voice_erasures_user_idx on public.voice_erasures (user_id, created_at desc);

-- Written by the trigger as the row is deleted (security definer: the owner
-- may delete their voice but never write erasure rows themselves).
create or replace function public.record_voice_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := to_jsonb(old);
begin
  insert into public.voice_erasures (voice_id, user_id, name, sample_key, provider, provider_voice_id, artifacts)
  values (
    old.id, old.user_id, coalesce(v ->> 'name', ''), v ->> 'sample_key', v ->> 'provider', v ->> 'provider_voice_id',
    coalesce((
      select jsonb_agg(jsonb_build_object('engine', a.engine_id, 'type', a.artifact_type, 'uri', a.artifact_uri))
      from public.voice_engine_artifacts a where a.voice_id = old.id
    ), '[]'::jsonb)
  );
  return old;
end;
$$;
revoke all on function public.record_voice_erasure() from public, anon, authenticated;
create trigger voices_record_erasure before delete on public.voices
  for each row execute function public.record_voice_erasure();

alter table public.voice_erasures enable row level security;
create policy voice_erasures_owner_read on public.voice_erasures
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.voice_erasures from anon;
revoke insert, update, delete on public.voice_erasures from authenticated;
