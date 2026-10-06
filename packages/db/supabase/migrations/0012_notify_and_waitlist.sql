-- Cineforge — schema part 12: finish notifications + marketplace waitlists (docs/36).

-- "Notify me" in the studio: email the owner when a production is READY/FAILED.
-- The worker sends it (RESEND_API_KEY + NOTIFY_FROM); users toggle their own row
-- under the existing users_self_update policy.
alter table public.users add column if not exists notify_on_finish boolean not null default false;

comment on column public.users.notify_on_finish is 'email the owner when a production finishes or fails';

-- Marketplace catalogues that are not open yet collect interest instead of
-- showing a dead end: one row per user per catalogue.
create table if not exists public.marketplace_waitlist (
  user_id    uuid not null references public.users(id) on delete cascade,
  catalogue  text not null check (catalogue in ('films', 'characters', 'voices', 'worlds', 'templates')),
  created_at timestamptz not null default now(),
  primary key (user_id, catalogue)
);

alter table public.marketplace_waitlist enable row level security;

create policy waitlist_owner on public.marketplace_waitlist
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy waitlist_admin_read on public.marketplace_waitlist
  for select to authenticated using (public.is_admin());
