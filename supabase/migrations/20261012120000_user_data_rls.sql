create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Untitled AST',
  source_code text not null,
  language text not null default 'minic',
  mode text not null default 'strict',
  tokens jsonb,
  ast jsonb not null,
  errors jsonb,
  repaired_code text,
  neural_ast jsonb,
  comparison jsonb,
  explanations jsonb,
  metrics jsonb,
  is_public boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suite_name text not null,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.samples (
  id text primary key,
  title text not null,
  category text not null,
  source_code text not null,
  difficulty text not null
);

alter table public.analyses enable row level security;
alter table public.benchmark_runs enable row level security;
alter table public.samples enable row level security;
alter table public.repair_events enable row level security;

do $$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array['analyses', 'benchmark_runs', 'samples', 'repair_events'] loop
    for policy_name in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy %I on public.%I', policy_name, target_table);
    end loop;
  end loop;
end;
$$;

create policy analyses_select_own on public.analyses
  for select to authenticated using (auth.uid() = user_id);
create policy analyses_insert_own on public.analyses
  for insert to authenticated with check (auth.uid() = user_id);
create policy analyses_update_own on public.analyses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy analyses_delete_own on public.analyses
  for delete to authenticated using (auth.uid() = user_id);

create policy benchmark_runs_select_own on public.benchmark_runs
  for select to authenticated using (auth.uid() = user_id);
create policy benchmark_runs_insert_own on public.benchmark_runs
  for insert to authenticated with check (auth.uid() = user_id);
create policy benchmark_runs_update_own on public.benchmark_runs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy benchmark_runs_delete_own on public.benchmark_runs
  for delete to authenticated using (auth.uid() = user_id);

create policy samples_read_only on public.samples
  for select to anon, authenticated using (true);

create policy repair_events_select_own on public.repair_events
  for select to authenticated using (auth.uid() = user_id);
create policy repair_events_insert_own on public.repair_events
  for insert to authenticated with check (auth.uid() = user_id);
create policy repair_events_delete_own on public.repair_events
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.get_public_analysis(p_slug text)
returns setof public.analyses
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.analyses
  where share_slug = p_slug and is_public = true
  limit 1;
$$;

revoke all on function public.get_public_analysis(text) from public;
grant execute on function public.get_public_analysis(text) to anon, authenticated;
grant select, insert, update, delete on public.analyses to authenticated;
grant select, insert, update, delete on public.benchmark_runs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.samples from anon, authenticated;
grant select on public.samples to anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;

create index if not exists analyses_user_created_idx
  on public.analyses (user_id, created_at desc);
create index if not exists benchmark_runs_user_created_idx
  on public.benchmark_runs (user_id, created_at desc);
