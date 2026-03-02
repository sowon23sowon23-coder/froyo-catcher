alter table if exists public.entries
  add column if not exists nickname_display text null,
  add column if not exists store text null;

create index if not exists entries_score_best_idx
  on public.entries (score_best desc);
