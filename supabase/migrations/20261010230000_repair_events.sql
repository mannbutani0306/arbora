create table if not exists public.repair_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  error_type text not null check (error_type in ('delete', 'insert', 'swap', 'natural')),
  candidates_count integer not null check (candidates_count >= 0),
  verified_count integer not null check (verified_count >= 0),
  top1_correct boolean,
  top3_correct boolean,
  latency_ms integer not null check (latency_ms >= 0),
  model text not null,
  engine text not null,
  exact_match boolean,
  ast_match boolean,
  verified boolean not null,
  edit_distance integer check (edit_distance is null or edit_distance >= 0),
  source_hash text,
  created_at timestamptz not null default now()
);

alter table public.repair_events enable row level security;

create policy "Users can read their own repair events"
  on public.repair_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own repair events"
  on public.repair_events for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own repair events"
  on public.repair_events for delete
  using (auth.uid() = user_id);

create index if not exists repair_events_user_created_idx
  on public.repair_events (user_id, created_at desc);
