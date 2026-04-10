export type CouponRewardType =
  | "discount_3_percent"
  | "discount_5_percent"
  | "discount_10_percent"
  | "discount_15_percent";
export type CouponGameMode = "free" | "mission" | "timeAttack";
export type CouponState = "valid" | "already_redeemed" | "expired" | "invalid";

export type CouponRewardDefinition = {
  type: CouponRewardType;
  threshold: number;
  discountPercent: number;
  fixedQrValue: string;
  title: string;
  description: string;
};

export const COUPON_EXPIRY_DAYS = 14;

export const COUPON_REWARDS: CouponRewardDefinition[] = [
  {
    type: "discount_15_percent",
    threshold: 150,
    discountPercent: 15,
    fixedQrValue: "YL15-TR62-L440-D26",
    title: "15% OFF",
    description: "Score 150 or more to unlock a 15% discount coupon.",
  },
  {
    type: "discount_10_percent",
    threshold: 100,
    discountPercent: 10,
    fixedQrValue: "YL10-QZ88-P357-R26",
    title: "10% OFF",
    description: "Score 100 or more to unlock a 10% discount coupon.",
  },
  {
    type: "discount_5_percent",
    threshold: 50,
    discountPercent: 5,
    fixedQrValue: "YL05-BV24-M108-W26",
    title: "5% OFF",
    description: "Score 50 or more to unlock a 5% discount coupon.",
  },
  {
    type: "discount_3_percent",
    threshold: 30,
    discountPercent: 3,
    fixedQrValue: "YL03-AX79-K921-S26",
    title: "3% OFF",
    description: "Score 30 or more to unlock a 3% discount coupon.",
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

export function getCouponRewardByType(rewardType: string | null | undefined) {
  return COUPON_REWARDS.find((reward) => reward.type === rewardType) ?? null;
}

export function getCouponRewardByPercent(discountPercent: number | null | undefined) {
  return COUPON_REWARDS.find((reward) => reward.discountPercent === discountPercent) ?? null;
}

export function inferCouponRewardFromText(...texts: Array<string | null | undefined>) {
  for (const rawText of texts) {
    const text = String(rawText || "");
    const match = text.match(/\b(3|5|10|15)\s*%/i);
    if (match) {
      return getCouponRewardByPercent(Number(match[1]));
    }
    if (/discount/i.test(text)) {
      return getCouponRewardByPercent(3);
    }
  }
  return null;
}

export function resolveCouponReward(
  rewardType: string | null | undefined,
  title?: string | null,
  description?: string | null
) {
  return getCouponRewardByType(rewardType) ?? inferCouponRewardFromText(title, description);
}

export function getCouponDiscountPercent(rewardType: string | null | undefined) {
  return getCouponRewardByType(rewardType)?.discountPercent ?? null;
}

export function getCouponFixedQrValue(rewardType: string | null | undefined) {
  return getCouponRewardByType(rewardType)?.fixedQrValue ?? null;
}

export function formatCouponLabel(rewardType: string | null | undefined) {
  const reward = getCouponRewardByType(rewardType);
  if (!reward) return "Coupon";
  return `${reward.discountPercent}%`;
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
