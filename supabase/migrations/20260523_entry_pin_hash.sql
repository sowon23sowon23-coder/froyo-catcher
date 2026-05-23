alter table if exists public.entries
  add column if not exists pin_hash text null;

create index if not exists entries_pin_hash_idx
  on public.entries (pin_hash)
  where pin_hash is not null;
