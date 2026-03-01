-- Core tables required by the app on a fresh Supabase project.
-- Safe to run multiple times.

create table if not exists public.leaderboard_best_v2 (
  id bigint generated always as identity primary key,
  nickname_key text not null,
  nickname_display text not null,
  score integer not null default 0 check (score >= 0),
  character text null check (character in ('green', 'berry', 'sprinkle')),
  store text null,
  updated_at timestamptz not null default now()
);

create unique index if not exists leaderboard_best_v2_nickname_store_unique_idx
  on public.leaderboard_best_v2 (nickname_key, store);

create index if not exists leaderboard_best_v2_score_idx
  on public.leaderboard_best_v2 (score desc);

create index if not exists leaderboard_best_v2_updated_at_idx
  on public.leaderboard_best_v2 (updated_at desc);

create or replace function public.set_leaderboard_best_v2_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_leaderboard_best_v2_updated_at_trigger on public.leaderboard_best_v2;
create trigger set_leaderboard_best_v2_updated_at_trigger
before update on public.leaderboard_best_v2
for each row
execute procedure public.set_leaderboard_best_v2_updated_at();

create table if not exists public.user_feedback (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) >= 5 and char_length(message) <= 600),
  nickname text null,
  store text null,
  source text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_created_at_idx
  on public.user_feedback (created_at desc);

alter table public.leaderboard_best_v2 enable row level security;
alter table public.user_feedback enable row level security;

drop policy if exists leaderboard_best_v2_select_all on public.leaderboard_best_v2;
create policy leaderboard_best_v2_select_all
on public.leaderboard_best_v2
for select
to anon, authenticated
using (true);

drop policy if exists leaderboard_best_v2_insert_all on public.leaderboard_best_v2;
create policy leaderboard_best_v2_insert_all
on public.leaderboard_best_v2
for insert
to anon, authenticated
with check (true);

drop policy if exists leaderboard_best_v2_update_all on public.leaderboard_best_v2;
create policy leaderboard_best_v2_update_all
on public.leaderboard_best_v2
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists user_feedback_insert_all on public.user_feedback;
create policy user_feedback_insert_all
on public.user_feedback
for insert
to anon, authenticated
with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.leaderboard_best_v2 to anon, authenticated;
grant insert on public.user_feedback to anon, authenticated;
grant usage, select on sequence public.leaderboard_best_v2_id_seq to anon, authenticated;
grant usage, select on sequence public.user_feedback_id_seq to anon, authenticated;
