-- Validation for migration 0055 (after stubs, 0026–0054).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into public.users (id) values ('00000000-0000-0000-0000-0000000055a0'), ('00000000-0000-0000-0000-0000000055b0');
insert into public.projects (id, user_id, status) values ('00000000-0000-0000-0000-0000000055a1', '00000000-0000-0000-0000-0000000055a0', 'PAUSED');

-- The owner presses Resume.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000055a0', false);
update public.projects set resume_requested_at = now() where id = '00000000-0000-0000-0000-0000000055a1';
reset role;
do $$ begin
  if (select resume_requested_at from public.projects where id = '00000000-0000-0000-0000-0000000055a1') is null then
    raise exception 'the owner could not request a resume';
  end if;
end $$;

-- A timestamp, nullable: the worker clears it when it claims the request.
do $$ begin
  if (select data_type || '/' || is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'resume_requested_at') <> 'timestamp with time zone/YES' then
    raise exception 'resume_requested_at must be a nullable timestamptz';
  end if;
end $$;
update public.projects set resume_requested_at = null where id = '00000000-0000-0000-0000-0000000055a1';
select 'ok 0055';
