-- Cineforge — schema part 42: Director workspace (DirectorOS W9; Part 2 §90–92).
--
--  ai_decisions.summary  the "why" of each AI decision in a sentence — what
--                        the Director planned, what a revision fixed, what a
--                        review found, how an instruction was read — shown in
--                        the workspace's decision log.
--  director_messages     the workspace chat: the owner writes an instruction
--                        in plain language ("make Maya's coat red from the
--                        harbour scene on"); the worker reads it with the
--                        intelligence layer, answers, and — when it is a
--                        change — files an edit request (0039), so it goes
--                        through canon, locks and passes like any other edit.
--
-- Owners insert their own messages and read their project's conversation;
-- only the worker writes the Director's replies and moves a message on.

alter table public.ai_decisions
  add column if not exists summary text check (summary is null or length(summary) <= 500);

create table public.director_messages (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  author           text not null check (author in ('owner', 'director')),
  user_id          uuid,
  body             text not null check (length(body) between 1 and 2000),
  status           text not null default 'pending' check (status in ('pending', 'answered', 'failed')),
  reply_to         uuid references public.director_messages (id) on delete cascade,
  edit_request_id  uuid references public.edit_requests (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index director_messages_project_idx on public.director_messages (project_id, created_at);
create index director_messages_pending_idx on public.director_messages (status) where status = 'pending';

create or replace function public.director_messages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id <> old.project_id or new.author <> old.author or new.body <> old.body or new.user_id is distinct from old.user_id then
    raise exception 'a message keeps its project, author and text' using errcode = '42501';
  end if;
  if old.status <> 'pending' and new.status <> old.status then
    raise exception 'message % is %; it cannot change again', old.id, old.status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger director_messages_guard before update on public.director_messages
  for each row execute function public.director_messages_guard();

alter table public.director_messages enable row level security;
create policy director_messages_owner_read on public.director_messages
  for select to authenticated using ((select public.owns_project(project_id)) or (select public.is_admin()));
create policy director_messages_owner_insert on public.director_messages
  for insert to authenticated
  with check ((select public.owns_project(project_id)) and author = 'owner' and user_id = (select auth.uid())
              and status = 'pending' and reply_to is null and edit_request_id is null);
revoke all on public.director_messages from anon;
revoke update, delete on public.director_messages from authenticated;
