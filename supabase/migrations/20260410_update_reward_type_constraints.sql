-- Update reward_type check constraints on coupon_reward_evaluations and wallet_coupons
-- to allow the new percent-based discount types (discount_3_percent, etc.)
-- while remaining backward compatible with legacy values.

-- ── coupon_reward_evaluations ──────────────────────────────────────────────
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t     ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname  = 'coupon_reward_evaluations'
    AND c.contype  = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%reward_type%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.coupon_reward_evaluations DROP CONSTRAINT %I',
      v_conname
    );
  END IF;
END $$;

ALTER TABLE public.coupon_reward_evaluations
  ADD CONSTRAINT coupon_reward_evaluations_reward_type_check
  CHECK (
    reward_type IS NULL OR reward_type IN (
      'free_topping', 'dollar_off', 'bogo',
      'discount_3_percent', 'discount_5_percent',
      'discount_10_percent', 'discount_15_percent'
    )
  );

-- ── wallet_coupons ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t     ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname  = 'wallet_coupons'
    AND c.contype  = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%reward_type%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.wallet_coupons DROP CONSTRAINT %I',
      v_conname
    );
  END IF;
END $$;

ALTER TABLE public.wallet_coupons
  ADD CONSTRAINT wallet_coupons_reward_type_check
  CHECK (
    reward_type IN (
      'free_topping', 'dollar_off', 'bogo',
      'discount_3_percent', 'discount_5_percent',
      'discount_10_percent', 'discount_15_percent'
    )
  );
