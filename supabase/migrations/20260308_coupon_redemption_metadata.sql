alter table if exists public.wallet_coupons
  add column if not exists redeemed_staff_name text null,
  add column if not exists redeemed_store_name text null;

create index if not exists wallet_coupons_status_created_idx
  on public.wallet_coupons (status, created_at desc);
