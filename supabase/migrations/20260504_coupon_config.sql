create extension if not exists pgcrypto;

create table if not exists public.coupon_config (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  updated_by uuid null references auth.users (id),
  updated_at timestamptz not null default now()
);

create index if not exists coupon_config_key_idx
  on public.coupon_config (key);

create table if not exists public.coupon_config_history (
  id bigint generated always as identity primary key,
  changed_by text null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists coupon_config_history_created_idx
  on public.coupon_config_history (created_at desc);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coupon_config_set_updated_at on public.coupon_config;
create trigger coupon_config_set_updated_at
before update on public.coupon_config
for each row
execute function public.set_row_updated_at();

insert into public.coupon_config (key, value)
values
  (
    'issuance_limit',
    '{
      "type":"daily",
      "max":500,
      "stopOnReach":true,
      "enabled":true,
      "campaignStartDate":null,
      "campaignEndDate":null,
      "soldOutMessage":"Today''s coupons are all gone.",
      "warningThresholds":[80,90,100]
    }'::jsonb
  ),
  (
    'reward_tiers',
    '[
      {"threshold":200,"discountPercent":20,"fixedQrValue":"YL20MN56P734Q26"},
      {"threshold":150,"discountPercent":15,"fixedQrValue":"YL15TR62L440D26"},
      {"threshold":100,"discountPercent":10,"fixedQrValue":"YL10QZ88P357R26"},
      {"threshold":50,"discountPercent":5,"fixedQrValue":"YL05BV24M108W26"},
      {"threshold":30,"discountPercent":3,"fixedQrValue":"YL03AX79K921S26"}
    ]'::jsonb
  )
on conflict (key) do nothing;

do $$
declare
  v_conname text;
begin
  if to_regclass('public.coupon_reward_evaluations') is null then
    return;
  end if;

  select c.conname into v_conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'coupon_reward_evaluations'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%reward_type%';

  if v_conname is not null then
    execute format('alter table public.coupon_reward_evaluations drop constraint %I', v_conname);
  end if;
end $$;

do $$
begin
  if to_regclass('public.coupon_reward_evaluations') is not null then
    alter table public.coupon_reward_evaluations
      add constraint coupon_reward_evaluations_reward_type_check
      check (
        reward_type is null
        or reward_type in ('free_topping', 'dollar_off', 'bogo')
        or reward_type ~ '^discount_([1-9][0-9]?|100)_percent$'
      );
  end if;
end $$;

do $$
declare
  v_conname text;
begin
  if to_regclass('public.wallet_coupons') is null then
    return;
  end if;

  select c.conname into v_conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'wallet_coupons'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%reward_type%';

  if v_conname is not null then
    execute format('alter table public.wallet_coupons drop constraint %I', v_conname);
  end if;
end $$;

do $$
begin
  if to_regclass('public.wallet_coupons') is not null then
    alter table public.wallet_coupons
      add constraint wallet_coupons_reward_type_check
      check (
        reward_type in ('free_topping', 'dollar_off', 'bogo')
        or reward_type ~ '^discount_([1-9][0-9]?|100)_percent$'
      );
  end if;
end $$;

alter table if exists public.coupon_config enable row level security;
alter table if exists public.coupon_config_history enable row level security;
revoke all on table public.coupon_config from anon, authenticated;
revoke all on table public.coupon_config_history from anon, authenticated;
