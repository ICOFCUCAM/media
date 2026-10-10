-- Cineforge — schema part 59: talking with an avatar (DirectorOS W26; Part 3
-- §111, §117 "Conversation": speech recognition → LLM reply → the cloned
-- voice → the talking avatar).
--
--  avatar_conversations  one conversation: the persona the avatar plays, the
--                        voice it speaks in, the portrait it is animated
--                        from (optional: without one it only speaks).
--  avatar_turns          the lines, in order. The owner adds their own line —
--                        text, or a recording the worker transcribes — as
--                        'pending'. The worker writes everything else: the
--                        avatar's reply, its reading (a voiceovers row) and
--                        its video (an avatar_videos row), and each status.

create table public.avatar_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  title       text not null default '' check (length(title) <= 120),
  persona     text not null check (length(persona) between 1 and 2000),
  voice_id    uuid references public.voices (id) on delete set null,
  language    text not null default 'en' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  image_key   text check (image_key is null or length(image_key) between 1 and 512),
  quality     text not null default 'standard' check (quality in ('standard', 'premium')),
  created_at  timestamptz not null default now()
);
create index avatar_conversations_user_idx on public.avatar_conversations (user_id, created_at desc);
alter table public.avatar_conversations enable row level security;
create policy avatar_conversations_owner on public.avatar_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.avatar_conversations to authenticated;

create table public.avatar_turns (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.avatar_conversations (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  role             text not null check (role in ('user', 'avatar')),
  text             text check (text is null or length(text) between 1 and 2000),
  audio_key        text check (audio_key is null or length(audio_key) between 1 and 512),
  status           text not null default 'pending'
                   check (status in ('pending', 'thinking', 'speaking', 'animating', 'ready', 'failed')),
  voiceover_id     uuid references public.voiceovers (id) on delete set null,
  avatar_video_id  uuid,
  error            text check (error is null or length(error) <= 500),
  created_at       timestamptz not null default now(),
  check (role = 'avatar' or text is not null or audio_key is not null)
);
create index avatar_turns_conversation_idx on public.avatar_turns (conversation_id, created_at);
create index avatar_turns_status_idx on public.avatar_turns (status) where status in ('pending', 'speaking', 'animating');
alter table public.avatar_turns enable row level security;
create policy avatar_turns_owner on public.avatar_turns for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.avatar_turns to authenticated;

-- A client adds only its own pending line, in its own conversation; the worker writes the rest.
-- Invoker rights: current_user must be the caller (a security definer would see its owner).
create or replace function public.guard_avatar_turn()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.role <> 'user' or new.status <> 'pending' or new.voiceover_id is not null or new.avatar_video_id is not null or new.error is not null then
      raise exception 'a client adds only its own pending line' using errcode = '42501';
    end if;
    if not exists (select 1 from public.avatar_conversations c where c.id = new.conversation_id and c.user_id = new.user_id) then
      raise exception 'not your conversation' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_avatar_turn() from public;
create trigger avatar_turns_guard before insert on public.avatar_turns
  for each row execute function public.guard_avatar_turn();

-- Owner folders in the asset bucket: <folder>/<the owner's id>/… for voice
-- samples, portraits, readings and recorded lines. The web uploads samples,
-- portraits and recordings there and plays readings and avatar videos back
-- through signed URLs; only the path's own user may (Supabase storage only;
-- skipped where there is none, as in the CI stub database).
do $do$
begin
  if to_regclass('storage.objects') is null then return; end if;
  execute $p$drop policy if exists "cineforge owner folders read" on storage.objects$p$;
  execute $p$drop policy if exists "cineforge owner folders insert" on storage.objects$p$;
  execute $p$drop policy if exists "cineforge owner folders update" on storage.objects$p$;
  execute $p$drop policy if exists "cineforge owner folders delete" on storage.objects$p$;
  execute $p$create policy "cineforge owner folders read" on storage.objects for select to authenticated using (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'voiceovers', 'talk')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute $p$create policy "cineforge owner folders insert" on storage.objects for insert to authenticated with check (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'talk')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute $p$create policy "cineforge owner folders update" on storage.objects for update to authenticated using (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'talk')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
  execute $p$create policy "cineforge owner folders delete" on storage.objects for delete to authenticated using (
    bucket_id = 'cineforge-assets' and (storage.foldername(name))[1] in ('voices', 'avatars', 'voiceovers', 'talk')
    and (storage.foldername(name))[2] = auth.uid()::text)$p$;
end
$do$;
