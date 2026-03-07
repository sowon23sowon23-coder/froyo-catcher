export type CouponRewardType = "free_topping" | "dollar_off" | "bogo";
export type CouponGameMode = "free" | "mission" | "timeAttack";
export type CouponState = "valid" | "already_redeemed" | "expired" | "invalid";

export type CouponRewardDefinition = {
  type: CouponRewardType;
  threshold: number;
  title: string;
  description: string;
};

export const COUPON_EXPIRY_DAYS = 14;

export const COUPON_REWARDS: CouponRewardDefinition[] = [
  {
    type: "bogo",
    threshold: 250,
    title: "BOGO",
    description: "Buy one frozen yogurt and enjoy a second one free, up to the same value.",
  },
  {
    type: "dollar_off",
    threshold: 180,
    title: "$1 Off",
    description: "Take $1 off your next frozen yogurt order at the counter.",
  },
  {
    type: "free_topping",
    threshold: 10,
    title: "Free Topping",
    description: "Treat yourself to one complimentary topping on your next cup.",
  },
] as const;

export type WalletCoupon = {
  id: number;
  rewardType: CouponRewardType;
  title: string;
  description: string;
  status: "active" | "redeemed" | "expired";
  state: CouponState;
  expiresAt: string;
  redeemToken: string;
  createdAt: string;
  redeemedAt?: string | null;
  redeemedStaffName?: string | null;
  redeemedStoreName?: string | null;
};

export function getEligibleCouponReward(score: number) {
  const normalized = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return COUPON_REWARDS.find((reward) => normalized >= reward.threshold) ?? null;
}

export function getCouponExpiryIso(now = new Date()) {
  const expires = new Date(now);
  expires.setDate(expires.getDate() + COUPON_EXPIRY_DAYS);
  expires.setHours(23, 59, 59, 999);
  return expires.toISOString();
}

export function isCouponExpired(expiresAt: string, now = Date.now()) {
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs < now;
}

export function formatCouponExpiry(expiresAt: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getCouponState(input: {
  status?: string | null;
  expiresAt?: string | null;
  redeemedAt?: string | null;
}): CouponState {
  const isRedeemed = input.status === "redeemed" || Boolean(input.redeemedAt);
  if (isRedeemed) return "already_redeemed";
  if (isCouponExpired(String(input.expiresAt || ""))) return "expired";
  return "valid";
}

export function getWalletCouponStatus(input: {
  status?: string | null;
  expiresAt?: string | null;
  redeemedAt?: string | null;
}): "active" | "redeemed" | "expired" {
  const state = getCouponState(input);
  if (state === "already_redeemed") return "redeemed";
  if (state === "expired") return "expired";
  return "active";
}
