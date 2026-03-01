create table if not exists public.entries (
  id bigint generated always as identity primary key,
  contact_type text not null check (contact_type in ('phone', 'email')),
  contact_value text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  score_best integer not null default 0,
  coupon_status text not null default 'pending' check (coupon_status in ('pending', 'sent', 'failed')),
  coupon_sent_at timestamptz null
);

create unique index if not exists entries_contact_unique_idx
  on public.entries (contact_type, contact_value);

