create table if not exists public.coupon_reward_evaluations (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.entries (id) on delete cascade,
  game_session_id uuid not null unique,
  game_mode text null check (game_mode in ('free', 'mission', 'timeAttack')),
  score integer not null check (score >= 0),
  reward_type text null check (reward_type in ('free_topping', 'dollar_off', 'bogo')),
  created_at timestamptz not null default now()
);

create index if not exists coupon_reward_evaluations_entry_created_idx
  on public.coupon_reward_evaluations (entry_id, created_at desc);

create table if not exists public.wallet_coupons (
  id bigint generated always as identity primary key,
  evaluation_id bigint not null unique references public.coupon_reward_evaluations (id) on delete cascade,
  entry_id bigint not null references public.entries (id) on delete cascade,
  game_session_id uuid not null unique,
  reward_type text not null check (reward_type in ('free_topping', 'dollar_off', 'bogo')),
  title text not null,
  description text not null,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  redeem_token text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  redeemed_by text null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_coupons_entry_active_idx
  on public.wallet_coupons (entry_id, status, expires_at desc, created_at desc);

alter table if exists public.coupon_reward_evaluations enable row level security;
alter table if exists public.wallet_coupons enable row level security;

do $$
begin
  if to_regclass('public.coupon_reward_evaluations') is not null then
    execute 'revoke all on table public.coupon_reward_evaluations from anon, authenticated';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.wallet_coupons') is not null then
    execute 'revoke all on table public.wallet_coupons from anon, authenticated';
  end if;
end
$$;
