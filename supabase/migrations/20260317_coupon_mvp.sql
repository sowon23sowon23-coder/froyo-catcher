create table if not exists public.stores (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_users (
  id text primary key,
  name text not null,
  store_id text not null references public.stores (id),
  role text not null default 'staff' check (role in ('staff', 'manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id bigint generated always as identity primary key,
  code text not null unique,
  user_id text null,
  coupon_name text not null,
  reward_type text not null,
  discount_amount integer not null check (discount_amount > 0),
  status text not null default 'unused' check (status in ('unused', 'used', 'expired')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  redeemed_store_id text null,
  redeemed_staff_id text null,
  order_number text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.redeem_logs (
  id bigint generated always as identity primary key,
  coupon_id bigint null references public.coupons (id) on delete set null,
  code text not null,
  action_type text not null check (action_type in ('validate', 'redeem_success', 'redeem_fail')),
  reason text null,
  store_id text null,
  staff_id text null,
  order_number text null,
  created_at timestamptz not null default now()
);

create index if not exists coupons_status_idx
  on public.coupons (status, expires_at desc, created_at desc);

create index if not exists coupons_user_id_idx
  on public.coupons (user_id, created_at desc);

create index if not exists coupons_store_redeemed_idx
  on public.coupons (redeemed_store_id, redeemed_at desc);

create index if not exists redeem_logs_coupon_created_idx
  on public.redeem_logs (coupon_id, created_at desc);

create index if not exists redeem_logs_code_created_idx
  on public.redeem_logs (code, created_at desc);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
before update on public.stores
for each row
execute function public.set_row_updated_at();

drop trigger if exists staff_users_set_updated_at on public.staff_users;
create trigger staff_users_set_updated_at
before update on public.staff_users
for each row
execute function public.set_row_updated_at();

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at
before update on public.coupons
for each row
execute function public.set_row_updated_at();

create or replace function public.redeem_coupon_atomic(
  p_code text,
  p_store_id text,
  p_staff_id text,
  p_order_number text default null
)
returns table (
  ok boolean,
  reason text,
  coupon_id bigint,
  coupon_code text,
  coupon_name text,
  discount_amount integer,
  status text,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_store_id text,
  redeemed_staff_id text,
  order_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_store_id text := nullif(trim(coalesce(p_store_id, '')), '');
  v_staff_id text := nullif(trim(coalesce(p_staff_id, '')), '');
  v_order_number text := nullif(trim(coalesce(p_order_number, '')), '');
  v_coupon public.coupons%rowtype;
begin
  select *
  into v_coupon
  from public.coupons
  where code = v_code
  for update;

  if not found then
    insert into public.redeem_logs (coupon_id, code, action_type, reason, store_id, staff_id, order_number)
    values (null, v_code, 'redeem_fail', 'invalid_code', v_store_id, v_staff_id, v_order_number);

    return query
    select false, 'invalid_code', null::bigint, v_code, null::text, null::integer, 'invalid'::text,
      null::timestamptz, null::timestamptz, v_store_id, v_staff_id, v_order_number;
    return;
  end if;

  if v_coupon.redeemed_at is not null or v_coupon.status = 'used' then
    insert into public.redeem_logs (coupon_id, code, action_type, reason, store_id, staff_id, order_number)
    values (v_coupon.id, v_coupon.code, 'redeem_fail', 'already_used', v_store_id, v_staff_id, v_order_number);

    return query
    select false, 'already_used', v_coupon.id, v_coupon.code, v_coupon.coupon_name, v_coupon.discount_amount,
      'used'::text, v_coupon.expires_at, v_coupon.redeemed_at, v_coupon.redeemed_store_id,
      v_coupon.redeemed_staff_id, v_coupon.order_number;
    return;
  end if;

  if v_coupon.expires_at < now() or v_coupon.status = 'expired' then
    update public.coupons
    set status = 'expired'
    where id = v_coupon.id
      and status <> 'expired';

    insert into public.redeem_logs (coupon_id, code, action_type, reason, store_id, staff_id, order_number)
    values (v_coupon.id, v_coupon.code, 'redeem_fail', 'expired', v_store_id, v_staff_id, v_order_number);

    return query
    select false, 'expired', v_coupon.id, v_coupon.code, v_coupon.coupon_name, v_coupon.discount_amount,
      'expired'::text, v_coupon.expires_at, null::timestamptz, null::text, null::text, v_order_number;
    return;
  end if;

  update public.coupons
  set
    status = 'used',
    redeemed_at = now(),
    redeemed_store_id = v_store_id,
    redeemed_staff_id = v_staff_id,
    order_number = v_order_number
  where id = v_coupon.id
  returning * into v_coupon;

  insert into public.redeem_logs (coupon_id, code, action_type, reason, store_id, staff_id, order_number)
  values (v_coupon.id, v_coupon.code, 'redeem_success', 'redeemed', v_store_id, v_staff_id, v_order_number);

  return query
  select true, 'redeemed', v_coupon.id, v_coupon.code, v_coupon.coupon_name, v_coupon.discount_amount,
    v_coupon.status, v_coupon.expires_at, v_coupon.redeemed_at, v_coupon.redeemed_store_id,
    v_coupon.redeemed_staff_id, v_coupon.order_number;
end;
$$;

alter table if exists public.stores enable row level security;
alter table if exists public.staff_users enable row level security;
alter table if exists public.coupons enable row level security;
alter table if exists public.redeem_logs enable row level security;

do $$
begin
  execute 'revoke all on table public.stores from anon, authenticated';
  execute 'revoke all on table public.staff_users from anon, authenticated';
  execute 'revoke all on table public.coupons from anon, authenticated';
  execute 'revoke all on table public.redeem_logs from anon, authenticated';
exception
  when undefined_table then
    null;
end
$$;

grant execute on function public.redeem_coupon_atomic(text, text, text, text) to service_role;
