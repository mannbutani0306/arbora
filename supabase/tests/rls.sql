begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'rls-a@example.invalid', '', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'rls-b@example.invalid', '', now(), now())
on conflict (id) do nothing;

insert into public.analyses (id, user_id, title, source_code, ast, is_public, share_slug)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'A private', 'int a;', '{}', false, 'rls-private'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b2', 'B public', 'int b;', '{}', true, 'rls-public')
on conflict (id) do nothing;
insert into public.benchmark_runs (id, user_id, suite_name, results)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'A run', '{}'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b2', 'B run', '{}')
on conflict (id) do nothing;
insert into public.repair_events
  (id, user_id, error_type, candidates_count, verified_count, latency_ms, model, engine, verified)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'delete', 1, 1, 1, 'test', 'classical', true),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b2', 'delete', 1, 1, 1, 'test', 'classical', true)
on conflict (id) do nothing;
insert into public.samples (id, title, category, source_code, difficulty)
values ('rls-sample', 'RLS sample', 'Test', 'int main() { return 0; }', 'Easy')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select is((select count(*)::integer from public.analyses), 1, 'user A reads only own analyses');
select is((with changed as (
  update public.analyses set title = 'stolen'
  where id = '00000000-0000-4000-8000-0000000000b2' returning 1
) select count(*)::integer from changed), 0, 'user A cannot update user B analysis');
select is((with removed as (
  delete from public.analyses where id = '00000000-0000-4000-8000-0000000000b2' returning 1
) select count(*)::integer from removed), 0, 'user A cannot delete user B analysis');
select is((select count(*)::integer from public.benchmark_runs), 1, 'user A reads only own benchmark runs');
select is((with changed as (
  update public.benchmark_runs set suite_name = 'stolen'
  where id = '00000000-0000-4000-8000-0000000000b2' returning 1
) select count(*)::integer from changed), 0, 'user A cannot update user B benchmark run');
select is((with removed as (
  delete from public.benchmark_runs where id = '00000000-0000-4000-8000-0000000000b2' returning 1
) select count(*)::integer from removed), 0, 'user A cannot delete user B benchmark run');
select is((select count(*)::integer from public.repair_events), 1, 'user A reads only own repair events');
select is((with removed as (
  delete from public.repair_events where id = '00000000-0000-4000-8000-0000000000b2' returning 1
) select count(*)::integer from removed), 0, 'user A cannot delete user B repair event');
select throws_ok(
  $$update public.repair_events set verified = false
    where id = '00000000-0000-4000-8000-0000000000b2'$$,
  '42501', null, 'repair events cannot be updated by users'
);
select is((select count(*)::integer from public.samples), 1, 'authenticated users can read samples');
reset role;

set local role anon;
select is((select count(*)::integer from public.get_public_analysis('rls-public')), 1, 'anon RPC returns a public analysis');
select is((select count(*)::integer from public.get_public_analysis('rls-private')), 0, 'anon RPC does not return a private analysis');
select throws_ok(
  $$select * from public.analyses$$, '42501', null, 'anon cannot select analyses directly'
);
select throws_ok(
  $$insert into public.samples (id, title, category, source_code, difficulty)
    values ('rls-write', 'no', 'no', 'int x;', 'Easy')$$,
  '42501', null, 'anon cannot write samples'
);
select throws_ok(
  $$select * from public.ai_usage$$, '42501', null, 'anon cannot read AI usage'
);

select * from finish();
rollback;
