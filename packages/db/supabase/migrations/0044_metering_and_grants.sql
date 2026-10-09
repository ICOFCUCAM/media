-- Cineforge — schema part 44: metering every paid call, and atomic,
-- idempotent credit grants (DirectorOS W11; gap analysis §W11).
--
--  usage_records   now meters every kind of paid work, not only video GPU
--                  time: LLM tokens, TTS characters, images, music seconds,
--                  moderation requests. Each row says what was used (unit,
--                  units, provider, model), what it cost (cost_usd) and what
--                  it was charged in credits (credit_ms, 0 until the owner
--                  sets a rate — METER_RATES).
--  stripe_events   one row per Stripe event applied. A retried or replayed
--                  webhook finds its id and changes nothing.
--  apply_stripe_grant(...)  the only way a purchase changes a balance: the
--                  event id is claimed and credits_ms incremented in ONE
--                  statement pair inside one transaction — no read-then-write,
--                  so a worker debit landing at the same moment is never lost.
--                  Service role only.

alter table public.usage_records
  add column if not exists provider  text,
  add column if not exists model     text,
  add column if not exists unit      text,
  add column if not exists units     numeric(16, 3) not null default 0,
  add column if not exists credit_ms bigint not null default 0,
  add column if not exists meta      jsonb not null default '{}';

alter table public.usage_records
  add constraint usage_records_kind_check check (kind in ('video', 'llm', 'tts', 'image', 'music', 'moderation')),
  add constraint usage_records_unit_check check (unit is null or unit in ('gpu_ms', 'tokens', 'characters', 'images', 'audio_seconds', 'requests')),
  add constraint usage_records_amounts_check check (units >= 0 and credit_ms >= 0 and cost_usd >= 0 and gpu_ms >= 0);

create index if not exists usage_records_project_kind_idx on public.usage_records (project_id, kind) where project_id is not null;

create table public.stripe_events (
  id          text primary key check (id ~ '^evt_[A-Za-z0-9_]+$'),
  type        text not null,
  user_id     uuid references public.users (id) on delete set null,
  credit_ms   bigint not null default 0 check (credit_ms >= 0),
  tier        text,
  created_at  timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
create policy stripe_events_admin_read on public.stripe_events for select to authenticated using ((select public.is_admin()));
revoke all on public.stripe_events from anon;
revoke insert, update, delete on public.stripe_events from authenticated;

create or replace function public.apply_stripe_grant(
  p_event_id  text,
  p_type      text,
  p_user      uuid,
  p_credit_ms bigint,
  p_tier      text default null,
  p_stripe_id text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_credit_ms < 0 then
    raise exception 'a grant cannot be negative' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    -- Raise (not return): the event is not recorded, so Stripe retries it.
    raise exception 'no user %', p_user using errcode = 'P0002';
  end if;
  insert into public.stripe_events (id, type, user_id, credit_ms, tier)
    values (p_event_id, p_type, p_user, p_credit_ms, p_tier)
    on conflict (id) do nothing;
  if not found then
    return false; -- already applied
  end if;
  update public.users
     set credits_ms = credits_ms + p_credit_ms,
         tier = coalesce(p_tier::public.tier, tier),
         stripe_id = coalesce(p_stripe_id, stripe_id)
   where id = p_user;
  return true;
end;
$$;
revoke all on function public.apply_stripe_grant(text, text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.apply_stripe_grant(text, text, uuid, bigint, text, text) to service_role;
