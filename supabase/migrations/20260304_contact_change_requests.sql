create table if not exists public.contact_change_requests (
  id uuid primary key default gen_random_uuid(),
  entry_id bigint not null references public.entries(id) on delete cascade,
  nickname_key text not null,
  old_contact_type text not null check (old_contact_type in ('phone', 'email')),
  old_contact_value text not null,
  new_contact_type text not null check (new_contact_type in ('phone', 'email')),
  new_contact_value text not null,
  old_code_hash text not null,
  new_code_hash text not null,
  old_verified boolean not null default false,
  new_verified boolean not null default false,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists contact_change_requests_entry_idx
  on public.contact_change_requests (entry_id, created_at desc);

create index if not exists contact_change_requests_expires_idx
  on public.contact_change_requests (expires_at);
