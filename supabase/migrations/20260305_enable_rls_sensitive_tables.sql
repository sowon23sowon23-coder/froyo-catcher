alter table if exists public.entries enable row level security;
alter table if exists public.rate_limit_events enable row level security;
alter table if exists public.contact_change_requests enable row level security;

-- Service-role based server APIs can still operate, while browser roles are blocked by default.
revoke all on table if exists public.entries from anon, authenticated;
revoke all on table if exists public.rate_limit_events from anon, authenticated;
revoke all on table if exists public.contact_change_requests from anon, authenticated;

