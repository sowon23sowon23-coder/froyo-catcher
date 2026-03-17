insert into public.stores (id, name, active)
values
  ('gangnam_01', 'Yogurtland Gangnam', true),
  ('pohang_01', 'Yogurtland Pohang', true),
  ('seocho_01', 'Yogurtland Seocho', true)
on conflict (id) do update
set
  name = excluded.name,
  active = excluded.active;

insert into public.staff_users (id, name, store_id, role, active)
values
  ('staff_01', 'Minji', 'gangnam_01', 'manager', true),
  ('staff_02', 'Jisoo', 'pohang_01', 'staff', true),
  ('staff_03', 'Hyunwoo', 'seocho_01', 'staff', true)
on conflict (id) do update
set
  name = excluded.name,
  store_id = excluded.store_id,
  role = excluded.role,
  active = excluded.active;

insert into public.coupons (
  code,
  user_id,
  coupon_name,
  reward_type,
  discount_amount,
  status,
  issued_at,
  expires_at,
  redeemed_at,
  redeemed_store_id,
  redeemed_staff_id,
  order_number
)
values
  ('YG7A92K3', 'user_123', '3,000원 할인 쿠폰', 'score_discount', 3000, 'unused', now() - interval '1 day', now() + interval '13 days', null, null, null, null),
  ('YG8B45M2', 'user_456', '3,000원 할인 쿠폰', 'score_discount', 3000, 'used', now() - interval '3 days', now() + interval '10 days', now() - interval '2 hours', 'pohang_01', 'staff_02', 'A1024'),
  ('YG3X71P9', 'user_789', '3,000원 할인 쿠폰', 'score_discount', 3000, 'expired', now() - interval '20 days', now() - interval '1 day', null, null, null, null)
on conflict (code) do nothing;

insert into public.redeem_logs (coupon_id, code, action_type, reason, store_id, staff_id, order_number, created_at)
select id, code, 'redeem_success', 'redeemed', redeemed_store_id, redeemed_staff_id, order_number, coalesce(redeemed_at, now())
from public.coupons
where code = 'YG8B45M2'
  and redeemed_at is not null
  and not exists (
    select 1
    from public.redeem_logs
    where coupon_id = public.coupons.id
      and action_type = 'redeem_success'
  );
