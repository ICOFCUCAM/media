-- Cineforge — schema part 19: team invites + brand kits (docs/33).
-- Applied live as "enterprise_teams_brand".
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  role text not null default 'EDITOR',   -- EDITOR | PRODUCER | VIEWER
  status text not null default 'PENDING', -- PENDING | ACCEPTED | REVOKED
  created_at timestamptz not null default now()
);
alter table public.team_invites enable row level security;
create policy team_invites_owner on public.team_invites for all using (owner_id = auth.uid());

create table if not exists public.brand_kits (
  user_id uuid primary key references public.users(id) on delete cascade,
  logo_key text,
  primary_color text default '#6366f1',
  secondary_color text default '#d946ef',
  outro_text text,
  updated_at timestamptz not null default now()
);
alter table public.brand_kits enable row level security;
create policy brand_kits_owner on public.brand_kits for all using (user_id = auth.uid());
