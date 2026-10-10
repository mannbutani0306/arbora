create table if not exists public.ai_usage (
  principal_type text not null check (principal_type in ('user', 'guest')),
  principal_key text not null,
  window_started_at timestamptz not null,
  call_count integer not null check (call_count > 0),
  primary key (principal_type, principal_key, window_started_at)
);

alter table public.ai_usage enable row level security;

create or replace function public.consume_ai_usage(
  p_principal_type text,
  p_principal_key text,
  p_limit integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := date_trunc('hour', clock_timestamp());
  v_call_count integer;
begin
  insert into public.ai_usage as usage (principal_type, principal_key, window_started_at, call_count)
  values (p_principal_type, p_principal_key, v_window_start, 1)
  on conflict (principal_type, principal_key, window_started_at)
  do update set call_count = usage.call_count + 1
  returning call_count into v_call_count;

  return query
    select
      v_call_count <= p_limit,
      greatest(1, ceil(extract(epoch from (v_window_start + interval '1 hour' - clock_timestamp())))::integer);
end;
$$;

revoke all on function public.consume_ai_usage(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_usage(text, text, integer) to service_role;
grant all on table public.ai_usage to service_role;
