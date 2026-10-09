-- Cineforge — schema part 50: who may speak with a voice, and how a reading
-- is spoken (DirectorOS W15; Part 4 §170, Part 3 §116–117).
--
--  voice_licences   a per-use licence to a community voice: the licensee
--                   accepts the owner's terms as they stand (snapshotted) through
--                   accept_voice_terms(); only an APPROVED, READY voice with
--                   recorded consent can be licensed, never one's own. The
--                   licensee may revoke it; the owner sees who holds one.
--  voiceovers       gain mode (narrator / presenter / conversation), style
--                   (emotion, energy, speed, pitch), speakers (a conversation's
--                   voices), and what was delivered (engine, duration).
--  guard            a reading may only name voices its owner owns or holds an
--                   active licence to, for a voice still on the shelf — checked
--                   in the database on every insert and update (§170.2: the
--                   user → voice check is always enforced server-side).

create table public.voice_licences (
  id           uuid primary key default gen_random_uuid(),
  voice_id     uuid not null references public.voices (id) on delete cascade,
  licensee_id  uuid not null references public.users (id) on delete cascade,
  terms        text not null default '',
  accepted_at  timestamptz not null default now(),
  revoked_at   timestamptz,
  unique (voice_id, licensee_id)
);
create index voice_licences_licensee_idx on public.voice_licences (licensee_id);

alter table public.voice_licences enable row level security;
-- The licensee and the voice's owner can read it; nobody writes it directly.
create policy voice_licences_read on public.voice_licences for select using (
  licensee_id = auth.uid() or exists (select 1 from public.voices v where v.id = voice_id and v.user_id = auth.uid())
);
revoke insert, update, delete on public.voice_licences from anon, authenticated;
grant select on public.voice_licences to authenticated;

-- May this user speak with this voice right now?
create or replace function public.voice_usable_by(p_voice uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.voices v
    where v.id = p_voice
      and (v.user_id = p_user
        or (v.share_status = 'APPROVED' and v.status = 'READY'
            and exists (select 1 from public.voice_licences l
                        where l.voice_id = v.id and l.licensee_id = p_user and l.revoked_at is null)))
  );
$$;
revoke all on function public.voice_usable_by(uuid, uuid) from public;

create or replace function public.accept_voice_terms(p_voice uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.voices;
  lid uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into v from public.voices where id = p_voice;
  if not found or v.share_status <> 'APPROVED' or v.status <> 'READY' then
    raise exception 'this voice is not offered for use' using errcode = 'P0002';
  end if;
  if v.consent_type is null or v.consent_confirmed_at is null then
    raise exception 'this voice has no recorded consent' using errcode = '42501';
  end if;
  if v.user_id = auth.uid() then raise exception 'this is your own voice — no licence needed' using errcode = '22023'; end if;
  insert into public.voice_licences (voice_id, licensee_id, terms)
  values (p_voice, auth.uid(), coalesce(v.share_terms, ''))
  on conflict (voice_id, licensee_id) do update set terms = excluded.terms, accepted_at = now(), revoked_at = null
  returning id into lid;
  return lid;
end $$;

create or replace function public.revoke_voice_licence(p_voice uuid) returns void
language sql security definer set search_path = public as $$
  update public.voice_licences set revoked_at = now()
  where voice_id = p_voice and licensee_id = auth.uid() and revoked_at is null;
$$;
revoke all on function public.accept_voice_terms(uuid), public.revoke_voice_licence(uuid) from public;
grant execute on function public.accept_voice_terms(uuid), public.revoke_voice_licence(uuid) to authenticated;

alter table public.voiceovers
  add column mode        text not null default 'narrator' check (mode in ('narrator', 'presenter', 'conversation')),
  add column style       jsonb not null default '{}' check (jsonb_typeof(style) = 'object'),
  add column speakers    jsonb not null default '[]' check (jsonb_typeof(speakers) = 'array' and jsonb_array_length(speakers) <= 4),
  add column engine      text,
  add column duration_ms int check (duration_ms is null or duration_ms >= 0);

create or replace function public.voiceovers_voice_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  sid uuid;
begin
  if new.voice_id is not null and not public.voice_usable_by(new.voice_id, new.user_id) then
    raise exception 'voice % is not yours and you hold no licence to use it', new.voice_id using errcode = '42501';
  end if;
  for s in select * from jsonb_array_elements(new.speakers) loop
    if jsonb_typeof(s) <> 'object' or coalesce(length(s->>'label'), 0) not between 1 and 40 then
      raise exception 'each speaker needs a label of 1–40 characters' using errcode = '22023';
    end if;
    if s ? 'voice_id' and jsonb_typeof(s->'voice_id') = 'string' then
      sid := (s->>'voice_id')::uuid;
      if not public.voice_usable_by(sid, new.user_id) then
        raise exception 'voice % is not yours and you hold no licence to use it', sid using errcode = '42501';
      end if;
    end if;
  end loop;
  if new.mode = 'conversation' and jsonb_array_length(new.speakers) < 2 then
    raise exception 'a conversation needs at least two speakers' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger voiceovers_voice_guard
  before insert or update of voice_id, speakers, mode, user_id on public.voiceovers
  for each row execute function public.voiceovers_voice_guard();
