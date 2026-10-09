-- Validation for migration 0048 (after stubs, 0026–0047).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.projects (id, user_id, title) values
  ('00000000-0000-0000-0000-0000000048a1', '00000000-0000-0000-0000-0000000048aa', 'A film'),
  ('00000000-0000-0000-0000-0000000048b1', '00000000-0000-0000-0000-0000000048bb', 'B film');
grant select, insert on public.editorial_reviews, public.edit_proposals to authenticated;

-- The owner files a review (a whole-cut review or one request); results are the worker's.
set test.uid = '00000000-0000-0000-0000-0000000048aa';
set role authenticated;
insert into public.editorial_reviews (id, project_id, requested_by, instruction) values
  ('00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048a1', '00000000-0000-0000-0000-0000000048aa', 'Make the opening 15 seconds faster.');
select pg_temp.expect_error($$insert into public.editorial_reviews (project_id, requested_by, status) values ('00000000-0000-0000-0000-0000000048a1', '00000000-0000-0000-0000-0000000048aa', 'ready')$$, '42501');
select pg_temp.expect_error($$insert into public.editorial_reviews (project_id, requested_by) values ('00000000-0000-0000-0000-0000000048b1', '00000000-0000-0000-0000-0000000048aa')$$, '42501');
select pg_temp.expect_error($$insert into public.edit_proposals (review_id, project_id, position, op, description) values ('00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048a1', 0, '{"op":"CUT_SHOT"}', 'x')$$, '42501');
reset role;

-- The worker writes the review and its proposals.
update public.editorial_reviews set status = 'reviewing' where id = '00000000-0000-0000-0000-0000000048c1';
insert into public.edit_proposals (id, review_id, project_id, position, op, description, effect) values
  ('00000000-0000-0000-0000-0000000048d1', '00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048a1', 0,
   '{"op":"TRIM_SHOT","sceneId":"scene_01","shotIndex":0,"toSec":3,"reason":"faster"}', 'Trim scene_01 shot 1 to 3s', '{"deltaSec":-2}'),
  ('00000000-0000-0000-0000-0000000048d2', '00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048a1', 1,
   '{"op":"CUT_SHOT","sceneId":"scene_01","shotIndex":2,"reason":"redundant"}', 'Cut scene_01 shot 3', '{"deltaSec":-4}');
select pg_temp.expect_error($$insert into public.edit_proposals (review_id, project_id, position, op, description) values ('00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048a1', 5, '{"op":"SPEED_UP_MUSIC"}', 'x')$$, '23514');
select pg_temp.expect_error($$insert into public.edit_proposals (review_id, project_id, position, op, description) values ('00000000-0000-0000-0000-0000000048c1', '00000000-0000-0000-0000-0000000048a1', 0, '{"op":"CUT_SHOT"}', 'dup position')$$, '23505');

-- Decisions wait until the review is ready.
set role authenticated;
select pg_temp.expect_error($$select public.decide_edit_proposal('00000000-0000-0000-0000-0000000048d1', true)$$, '42501');
reset role;
update public.editorial_reviews set status = 'ready', summary = 'Tightened.' where id = '00000000-0000-0000-0000-0000000048c1';

set role authenticated;
select pg_temp.expect_error($$select public.request_editorial_apply('00000000-0000-0000-0000-0000000048c1')$$, '22023');
select public.decide_edit_proposal('00000000-0000-0000-0000-0000000048d1', true);
select public.decide_edit_proposal('00000000-0000-0000-0000-0000000048d2', false);
select public.request_editorial_apply('00000000-0000-0000-0000-0000000048c1');
-- Once applying is requested the decisions are closed.
select pg_temp.expect_error($$select public.decide_edit_proposal('00000000-0000-0000-0000-0000000048d2', true)$$, '42501');
reset role;

-- Another owner can neither see nor decide.
set test.uid = '00000000-0000-0000-0000-0000000048bb';
set role authenticated;
do $$ begin
  if exists (select 1 from public.editorial_reviews) or exists (select 1 from public.edit_proposals) then
    raise exception 'B must not see A''s review';
  end if;
end $$;
select pg_temp.expect_error($$select public.request_editorial_apply('00000000-0000-0000-0000-0000000048c1')$$, '42501');
reset role;

do $$ begin
  if (select string_agg(status, ',' order by position) from public.edit_proposals) <> 'approved,rejected' then
    raise exception 'decisions not recorded';
  end if;
  if (select status from public.editorial_reviews) <> 'apply_requested' then raise exception 'apply not requested'; end if;
end $$;

-- Guards: a proposal keeps its operation; finished is final.
select pg_temp.expect_error($$update public.edit_proposals set op = '{"op":"CUT_SHOT","sceneId":"scene_01","shotIndex":0,"reason":"x"}' where position = 0$$, '42501');
update public.editorial_reviews set status = 'applied', applied_version = 'v2' where id = '00000000-0000-0000-0000-0000000048c1';
select pg_temp.expect_error($$update public.editorial_reviews set status = 'ready' where id = '00000000-0000-0000-0000-0000000048c1'$$, '42501');
select pg_temp.expect_error($$update public.editorial_reviews set instruction = 'other' where id = '00000000-0000-0000-0000-0000000048c1'$$, '42501');

-- cut_sec is a positive length.
select pg_temp.expect_error($$insert into public.shots (cut_sec) values (0)$$, '23514');

select 'ok 0048' as result;
