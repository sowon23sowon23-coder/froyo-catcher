create table if not exists public.rate_limit_events (
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_key_created_at_idx
  on public.rate_limit_events (key, created_at);

drop function if exists public.check_rate_limit(text, integer, integer);

create function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_count integer;
begin
  if p_key is null or p_key = '' or p_limit <= 0 or p_window_seconds <= 0 then
    return false;
  end if;

  delete from public.rate_limit_events
  where created_at < v_now - interval '1 day';

  select count(*) into v_count
  from public.rate_limit_events
  where key = p_key
    and created_at >= v_window_start;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_events (key, created_at)
  values (p_key, v_now);

  return true;
end;
$$;
