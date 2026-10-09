-- Validation for migration 0044 (after stubs, 0026–0043).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(stmt text, code text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'expected % from: %', code, stmt;
exception when others then
  if sqlstate <> code then raise exception 'expected % got % (%) from: %', code, sqlstate, sqlerrm, stmt; end if;
end $$;

insert into public.users (id, credits_ms) values ('00000000-0000-0000-0000-0000000044aa', 1000);

-- Metering: every kind of paid work, with what was used and charged.
insert into public.usage_records (user_id, kind, provider, model, unit, units, credit_ms, cost_usd, meta)
  values ('00000000-0000-0000-0000-0000000044aa', 'llm', 'anthropic', 'claude-opus-5-5', 'tokens', 12500, 0, 0.11, '{"inputTokens": 10000, "outputTokens": 2500}');
insert into public.usage_records (user_id, kind, unit, units) values ('00000000-0000-0000-0000-0000000044aa', 'tts', 'characters', 420);
select pg_temp.expect_error($$insert into public.usage_records (user_id, kind) values ('00000000-0000-0000-0000-0000000044aa', 'vibes')$$, '23514');
select pg_temp.expect_error($$insert into public.usage_records (user_id, kind, unit) values ('00000000-0000-0000-0000-0000000044aa', 'llm', 'words')$$, '23514');
select pg_temp.expect_error($$insert into public.usage_records (user_id, kind, credit_ms) values ('00000000-0000-0000-0000-0000000044aa', 'llm', -5)$$, '23514');

-- Grants are atomic increments and idempotent per Stripe event.
do $$ begin
  if not public.apply_stripe_grant('evt_1', 'checkout.session.completed', '00000000-0000-0000-0000-0000000044aa', 1500, 'CREATOR', 'cus_1') then
    raise exception 'first delivery should apply';
  end if;
  if public.apply_stripe_grant('evt_1', 'checkout.session.completed', '00000000-0000-0000-0000-0000000044aa', 1500, 'CREATOR', 'cus_1') then
    raise exception 'a replay must not apply twice';
  end if;
  if (select credits_ms from public.users where id = '00000000-0000-0000-0000-0000000044aa') <> 2500 then
    raise exception 'balance should be 1000 + 1500, got %', (select credits_ms from public.users where id = '00000000-0000-0000-0000-0000000044aa');
  end if;
  if (select tier::text || '/' || stripe_id from public.users where id = '00000000-0000-0000-0000-0000000044aa') <> 'CREATOR/cus_1' then
    raise exception 'tier and customer not set';
  end if;
  -- A cancellation is a zero-credit grant that only moves the tier, once.
  perform public.apply_stripe_grant('evt_2', 'customer.subscription.deleted', '00000000-0000-0000-0000-0000000044aa', 0, 'FREE');
  if (select tier::text from public.users where id = '00000000-0000-0000-0000-0000000044aa') <> 'FREE' then raise exception 'tier not reset'; end if;
end $$;
select pg_temp.expect_error($$select public.apply_stripe_grant('evt_3', 'x', '00000000-0000-0000-0000-0000000044aa', -1)$$, '22023');
select pg_temp.expect_error($$select public.apply_stripe_grant('evt_4', 'x', '00000000-0000-0000-0000-0000000044ff', 10)$$, 'P0002');
do $$ begin
  if exists (select 1 from public.stripe_events where id in ('evt_3', 'evt_4')) then raise exception 'a refused grant must leave no event row'; end if;
end $$;
select pg_temp.expect_error($$select public.apply_stripe_grant('not-an-event', 'x', '00000000-0000-0000-0000-0000000044aa', 1)$$, '23514');

-- Only the service role may grant.
set role authenticated;
select pg_temp.expect_error($$select public.apply_stripe_grant('evt_5', 'x', '00000000-0000-0000-0000-0000000044aa', 999999)$$, '42501');
do $$ begin
  if exists (select 1 from public.stripe_events) then raise exception 'non-admins can read stripe events'; end if;
end $$;
reset role;
set role service_role;
select public.apply_stripe_grant('evt_6', 'invoice.paid', '00000000-0000-0000-0000-0000000044aa', 1500);
reset role;

select 'ok 0044' as result;
