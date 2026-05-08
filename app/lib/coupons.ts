export type CouponRewardType = string;
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

export const COUPON_EXPIRY_HOURS = 24;

export const COUPON_REWARDS: CouponRewardDefinition[] = [
  {
    type: "discount_20_percent",
    threshold: 200,
    discountPercent: 20,
    fixedQrValue: "YL20MN56P734Q26",
    title: "20% OFF",
    description: "Score 200 or more to unlock a 20% discount coupon.",
  },
  {
    type: "discount_15_percent",
    threshold: 150,
    discountPercent: 15,
    fixedQrValue: "YL15TR62L440D26",
    title: "15% OFF",
    description: "Score 150 or more to unlock a 15% discount coupon.",
  },
  {
    type: "discount_10_percent",
    threshold: 100,
    discountPercent: 10,
    fixedQrValue: "YL10QZ88P357R26",
    title: "10% OFF",
    description: "Score 100 or more to unlock a 10% discount coupon.",
  },
  {
    type: "discount_5_percent",
    threshold: 50,
    discountPercent: 5,
    fixedQrValue: "YL05BV24M108W26",
    title: "5% OFF",
    description: "Score 50 or more to unlock a 5% discount coupon.",
  },
  {
    type: "discount_3_percent",
    threshold: 30,
    discountPercent: 3,
    fixedQrValue: "YL03AX79K921S26",
    title: "3% OFF",
    description: "Score 30 or more to unlock a 3% discount coupon.",
  },
] as const;

export type CouponRewardTierConfig = {
  threshold: number;
  discountPercent: number;
  fixedQrValue?: string | null;
  active?: boolean;
};

export type CouponIssuanceLimitConfig = {
  type: "daily" | "campaign";
  max: number;
  stopOnReach: boolean;
  enabled?: boolean;
  campaignStartDate?: string | null;
  campaignEndDate?: string | null;
  soldOutMessage?: string | null;
};

export const COUPON_CONFIG_KEYS = {
  issuanceLimit: "issuance_limit",
  rewardTiers: "reward_tiers",
} as const;

function getDefaultRewardForPercent(discountPercent: number) {
  return COUPON_REWARDS.find((reward) => reward.discountPercent === discountPercent) ?? null;
}

export function getCouponRewardType(discountPercent: number): CouponRewardType {
  return `discount_${discountPercent}_percent`;
}

export function createFallbackQrValue(discountPercent: number, threshold: number) {
  const seed = `${discountPercent}:${threshold}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `YL${String(discountPercent).padStart(2, "0")}${hash.toString(36).toUpperCase().padStart(8, "0").slice(0, 8)}`;
}

export function buildCouponRewardFromTier(tier: CouponRewardTierConfig): CouponRewardDefinition {
  const defaultReward = getDefaultRewardForPercent(tier.discountPercent);
  const discountPercent = Math.max(1, Math.min(100, Math.floor(tier.discountPercent)));
  const threshold = Math.max(1, Math.floor(tier.threshold));

  return {
    type: defaultReward?.type ?? getCouponRewardType(discountPercent),
    threshold,
    discountPercent,
    fixedQrValue: String(tier.fixedQrValue || defaultReward?.fixedQrValue || createFallbackQrValue(discountPercent, threshold)),
    title: `${discountPercent}% OFF`,
    description: `Score ${threshold} or more to unlock a ${discountPercent}% discount coupon.`,
  };
}

export function normalizeRewardTiers(input: unknown): CouponRewardTierConfig[] {
  const rawTiers = Array.isArray(input) ? input : [];
  const byThreshold = new Map<number, CouponRewardTierConfig>();

  for (const raw of rawTiers) {
    if (!raw || typeof raw !== "object") continue;
    const tier = raw as { threshold?: unknown; discountPercent?: unknown; fixedQrValue?: unknown; active?: unknown };
    const threshold = Number(tier.threshold);
    const discountPercent = Number(tier.discountPercent);
    if (!Number.isInteger(threshold) || threshold < 1) continue;
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) continue;
    byThreshold.set(threshold, {
      threshold,
      discountPercent,
      fixedQrValue: typeof tier.fixedQrValue === "string" && tier.fixedQrValue.trim() ? tier.fixedQrValue.trim() : null,
      active: tier.active !== false,
    });
  }

  return Array.from(byThreshold.values()).sort((a, b) => b.threshold - a.threshold);
}

export function getDefaultRewardTiers(): CouponRewardTierConfig[] {
  return COUPON_REWARDS.map((reward) => ({
    threshold: reward.threshold,
    discountPercent: reward.discountPercent,
    fixedQrValue: reward.fixedQrValue,
    active: true,
  }));
}

export async function getConfiguredCouponRewards(supabase: any): Promise<CouponRewardDefinition[]> {
  const result = await supabase
    .from("coupon_config")
    .select("value")
    .eq("key", COUPON_CONFIG_KEYS.rewardTiers)
    .maybeSingle();

  if (result.error) {
    console.error("Reward tier config lookup failed", result.error);
    return [...COUPON_REWARDS];
  }

  const configuredTiers = normalizeRewardTiers(result.data?.value);
  const tiers = configuredTiers.length > 0 ? configuredTiers : getDefaultRewardTiers();
  return tiers.filter((tier) => tier.active !== false).map(buildCouponRewardFromTier);
}

export async function getEligibleConfiguredCouponReward(supabase: any, score: number) {
  const normalized = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  const rewards = await getConfiguredCouponRewards(supabase);
  return rewards.find((reward) => normalized >= reward.threshold) ?? null;
}

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
  const staticReward = COUPON_REWARDS.find((reward) => reward.type === rewardType) ?? null;
  if (staticReward) return staticReward;

  const match = String(rewardType || "").match(/^discount_(\d{1,3})_percent$/);
  if (!match) return null;
  const discountPercent = Number(match[1]);
  if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100) return null;
  return buildCouponRewardFromTier({ threshold: 1, discountPercent });
}

export function getCouponRewardByPercent(discountPercent: number | null | undefined) {
  const percent = Number(discountPercent);
  const staticReward = COUPON_REWARDS.find((reward) => reward.discountPercent === percent) ?? null;
  if (staticReward) return staticReward;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) return null;
  return buildCouponRewardFromTier({ threshold: 1, discountPercent: percent });
}

export function inferCouponRewardFromText(...texts: Array<string | null | undefined>) {
  for (const rawText of texts) {
    const text = String(rawText || "");
    const match = text.match(/\b(\d{1,3})\s*%/i);
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
  const expires = new Date(now.getTime() + COUPON_EXPIRY_HOURS * 60 * 60 * 1000);
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
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
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
