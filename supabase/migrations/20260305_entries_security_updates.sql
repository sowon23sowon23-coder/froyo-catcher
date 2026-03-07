create table if not exists public.nickname_change_logs (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.entries(id) on delete cascade,
  old_nickname_key text null,
  old_nickname_display text null,
  new_nickname_key text not null,
  new_nickname_display text not null,
  changed_by text not null default 'self_register',
  changed_at timestamptz not null default now()
);

create index if not exists nickname_change_logs_entry_changed_at_idx
  on public.nickname_change_logs (entry_id, changed_at desc);

alter table if exists public.entries enable row level security;
alter table if exists public.rate_limit_events enable row level security;
alter table if exists public.contact_change_requests enable row level security;

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
