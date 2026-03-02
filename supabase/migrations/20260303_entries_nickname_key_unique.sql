alter table if exists public.entries
  add column if not exists nickname_key text null;

update public.entries
set nickname_key = nullif(lower(trim(nickname_display)), '')
where nickname_key is null;

create unique index if not exists entries_nickname_key_unique_idx
  on public.entries (nickname_key)
  where nickname_key is not null;
