create table if not exists public.model_evaluations (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  task text not null,
  dataset text not null,
  n_test integer not null check (n_test >= 0),
  metrics jsonb not null default '{}'::jsonb,
  by_error_type jsonb not null default '{}'::jsonb,
  by_length_bucket jsonb not null default '{}'::jsonb,
  config jsonb,
  notes text,
  seed text,
  git_sha text,
  created_at timestamptz not null default now()
);

alter table public.model_evaluations enable row level security;

drop policy if exists "Public can read model evaluations" on public.model_evaluations;
create policy "Public can read model evaluations"
  on public.model_evaluations for select
  to anon, authenticated
  using (true);

grant select on public.model_evaluations to anon, authenticated;
