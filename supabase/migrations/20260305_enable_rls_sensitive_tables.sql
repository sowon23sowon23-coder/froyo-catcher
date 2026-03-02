alter table if exists public.entries enable row level security;
alter table if exists public.rate_limit_events enable row level security;
alter table if exists public.contact_change_requests enable row level security;

-- Service-role based server APIs can still operate, while browser roles are blocked by default.
do $$
begin
  if to_regclass('public.entries') is not null then
    execute 'revoke all on table public.entries from anon, authenticated';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.rate_limit_events') is not null then
    execute 'revoke all on table public.rate_limit_events from anon, authenticated';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.contact_change_requests') is not null then
    execute 'revoke all on table public.contact_change_requests from anon, authenticated';
  end if;
end
$$;
