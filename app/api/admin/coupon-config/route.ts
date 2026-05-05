import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import {
  COUPON_CONFIG_KEYS,
  buildCouponRewardFromTier,
  getDefaultRewardTiers,
  normalizeRewardTiers,
  type CouponIssuanceLimitConfig,
  type CouponRewardTierConfig,
} from "../../../lib/coupons";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

type CouponConfigMap = {
  issuance_limit?: CouponIssuanceLimitConfig | null;
  reward_tiers?: CouponRewardTierConfig[] | null;
};

function normalizeIssuanceLimit(input: unknown): CouponIssuanceLimitConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<CouponIssuanceLimitConfig>;
  const type = raw.type === "campaign" ? "campaign" : raw.type === "daily" ? "daily" : null;
  const max = Number(raw.max);
  if (!type || !Number.isInteger(max) || max < 1) return null;
  return {
    type,
    max,
    stopOnReach: raw.stopOnReach !== false,
  };
}

function ensureTierQrValues(tiers: CouponRewardTierConfig[]) {
  return tiers.map((tier) => {
    const reward = buildCouponRewardFromTier(tier);
    return {
      threshold: reward.threshold,
      discountPercent: reward.discountPercent,
      fixedQrValue: reward.fixedQrValue,
    };
  });
}

async function loadConfig(supabase: any) {
  const configResult = await supabase
    .from("coupon_config")
    .select("key,value,updated_at")
    .in("key", [COUPON_CONFIG_KEYS.issuanceLimit, COUPON_CONFIG_KEYS.rewardTiers]);

  if (configResult.error) {
    console.error("Coupon config lookup failed", configResult.error);
    throw new Error("Failed to load coupon configuration.");
  }

  const map = new Map<string, unknown>();
  for (const row of configResult.data ?? []) {
    map.set(String(row.key), row.value);
  }

  const issuanceLimit = normalizeIssuanceLimit(map.get(COUPON_CONFIG_KEYS.issuanceLimit));
  const configuredTiers = normalizeRewardTiers(map.get(COUPON_CONFIG_KEYS.rewardTiers));
  const rewardTiers = configuredTiers.length > 0 ? ensureTierQrValues(configuredTiers) : getDefaultRewardTiers();

  let dailyQuery = supabase.from("wallet_coupons").select("id", { count: "exact", head: true });
  const todayMidnightUtc = new Date();
  todayMidnightUtc.setUTCHours(0, 0, 0, 0);
  dailyQuery = dailyQuery.gte("created_at", todayMidnightUtc.toISOString());

  const [dailyCountResult, campaignCountResult] = await Promise.all([
    dailyQuery,
    supabase.from("wallet_coupons").select("id", { count: "exact", head: true }),
  ]);

  if (dailyCountResult.error || campaignCountResult.error) {
    console.error("Coupon issuance count lookup failed", dailyCountResult.error || campaignCountResult.error);
    throw new Error("Failed to load coupon issuance counts.");
  }

  const currentIssued = issuanceLimit?.type === "campaign"
    ? campaignCountResult.count ?? 0
    : dailyCountResult.count ?? 0;

  return {
    issuanceLimit,
    rewardTiers,
    issuanceStats: {
      dailyIssued: dailyCountResult.count ?? 0,
      campaignIssued: campaignCountResult.count ?? 0,
      currentIssued,
      percentUsed: issuanceLimit?.max ? Math.min(100, Math.round((currentIssued / issuanceLimit.max) * 100)) : 0,
    },
  };
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    return NextResponse.json(await loadConfig(getServiceSupabaseOrThrow()));
  } catch (error) {
    console.error("Admin coupon-config GET route error", error);
    return NextResponse.json({ error: "Failed to load coupon settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  let body: CouponConfigMap;
  try {
    body = (await req.json()) as CouponConfigMap;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const issuanceLimit = normalizeIssuanceLimit(body.issuance_limit);
  const rewardTiers = normalizeRewardTiers(body.reward_tiers);

  if (!issuanceLimit) {
    return NextResponse.json({ error: "Please enter a valid coupon issuance limit." }, { status: 400 });
  }

  if (rewardTiers.length < 1) {
    return NextResponse.json({ error: "At least one reward tier is required." }, { status: 400 });
  }

  if (new Set(rewardTiers.map((tier) => tier.threshold)).size !== rewardTiers.length) {
    return NextResponse.json({ error: "Score thresholds cannot be duplicated." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const rows = [
      { key: COUPON_CONFIG_KEYS.issuanceLimit, value: issuanceLimit, updated_at: new Date().toISOString() },
      { key: COUPON_CONFIG_KEYS.rewardTiers, value: ensureTierQrValues(rewardTiers), updated_at: new Date().toISOString() },
    ];

    const saved = await supabase.from("coupon_config").upsert(rows, { onConflict: "key" });
    if (saved.error) {
      console.error("Coupon config save failed", saved.error);
      return NextResponse.json({ error: "Failed to save coupon settings." }, { status: 500 });
    }

    return NextResponse.json(await loadConfig(supabase));
  } catch (error) {
    console.error("Admin coupon-config PUT route error", error);
    return NextResponse.json({ error: "Failed to save coupon settings." }, { status: 500 });
  }
}
