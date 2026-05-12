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

function normalizeDateValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

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
    enabled: raw.enabled !== false,
    campaignStartDate: normalizeDateValue(raw.campaignStartDate),
    campaignEndDate: normalizeDateValue(raw.campaignEndDate),
    soldOutMessage: typeof raw.soldOutMessage === "string" && raw.soldOutMessage.trim()
      ? raw.soldOutMessage.trim().slice(0, 180)
      : "아쉽게도 오늘의 쿠폰이 모두 소진되었습니다.",
  };
}

function ensureTierQrValues(tiers: CouponRewardTierConfig[]) {
  return tiers.map((tier) => {
    const reward = buildCouponRewardFromTier(tier);
    return {
      threshold: reward.threshold,
      discountPercent: reward.discountPercent,
      fixedQrValue: reward.fixedQrValue,
      active: tier.active !== false,
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

  let dailyQuery = supabase.from("wallet_coupons").select("*", { count: "exact", head: true });
  const todayMidnightUtc = new Date();
  todayMidnightUtc.setUTCHours(0, 0, 0, 0);
  dailyQuery = dailyQuery.gte("created_at", todayMidnightUtc.toISOString());
  let campaignQuery = supabase.from("wallet_coupons").select("*", { count: "exact", head: true });
  if (issuanceLimit?.campaignStartDate) {
    campaignQuery = campaignQuery.gte("created_at", `${issuanceLimit.campaignStartDate}T00:00:00.000Z`);
  }
  if (issuanceLimit?.campaignEndDate) {
    const end = new Date(`${issuanceLimit.campaignEndDate}T00:00:00.000Z`);
    if (!Number.isNaN(end.getTime())) {
      end.setUTCDate(end.getUTCDate() + 1);
      campaignQuery = campaignQuery.lt("created_at", end.toISOString());
    }
  }

  const [dailyCountResult, campaignCountResult] = await Promise.all([
    dailyQuery,
    campaignQuery,
  ]);

  if (dailyCountResult.error || campaignCountResult.error) {
    console.error("Coupon issuance count lookup failed", dailyCountResult.error || campaignCountResult.error);
    throw new Error("Failed to load coupon issuance counts.");
  }

  const currentIssued = issuanceLimit?.type === "campaign"
    ? campaignCountResult.count ?? 0
    : dailyCountResult.count ?? 0;

  let completedAt: string | null = null;
  if (issuanceLimit && issuanceLimit.max > 0 && currentIssued >= issuanceLimit.max) {
    let completionQuery = supabase
      .from("wallet_coupons")
      .select("created_at")
      .order("created_at", { ascending: true })
      .range(issuanceLimit.max - 1, issuanceLimit.max - 1);
    if (issuanceLimit.type === "daily") {
      completionQuery = completionQuery.gte("created_at", todayMidnightUtc.toISOString());
    } else {
      if (issuanceLimit.campaignStartDate) {
        completionQuery = completionQuery.gte("created_at", `${issuanceLimit.campaignStartDate}T00:00:00.000Z`);
      }
      if (issuanceLimit.campaignEndDate) {
        const end = new Date(`${issuanceLimit.campaignEndDate}T00:00:00.000Z`);
        if (!Number.isNaN(end.getTime())) {
          end.setUTCDate(end.getUTCDate() + 1);
          completionQuery = completionQuery.lt("created_at", end.toISOString());
        }
      }
    }
    const completionResult = await completionQuery.maybeSingle();
    if (!completionResult.error && completionResult.data?.created_at) {
      completedAt = String(completionResult.data.created_at);
    }
  }

  const [recentHistoryResult] = await Promise.all([
    supabase
      .from("coupon_config_history")
      .select("id,changed_by,changes,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return {
    issuanceLimit,
    rewardTiers,
    issuanceStats: {
      dailyIssued: dailyCountResult.count ?? 0,
      campaignIssued: campaignCountResult.count ?? 0,
      currentIssued,
      percentUsed: issuanceLimit?.max ? Math.min(100, Math.round((currentIssued / issuanceLimit.max) * 100)) : 0,
      completedAt,
    },
    history: recentHistoryResult.error ? [] : recentHistoryResult.data ?? [],
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

  if (issuanceLimit.type === "campaign" && issuanceLimit.campaignStartDate && issuanceLimit.campaignEndDate) {
    if (issuanceLimit.campaignStartDate > issuanceLimit.campaignEndDate) {
      return NextResponse.json({ error: "Campaign start date must be before the end date." }, { status: 400 });
    }
  }

  if (rewardTiers.length < 1) {
    return NextResponse.json({ error: "At least one reward tier is required." }, { status: 400 });
  }

  if (new Set(rewardTiers.map((tier) => tier.threshold)).size !== rewardTiers.length) {
    return NextResponse.json({ error: "Score thresholds cannot be duplicated." }, { status: 400 });
  }

  const sortedForSafety = rewardTiers.filter((tier) => tier.active !== false).sort((a, b) => b.threshold - a.threshold);
  for (let i = 1; i < sortedForSafety.length; i += 1) {
    if (sortedForSafety[i]!.discountPercent > sortedForSafety[i - 1]!.discountPercent) {
      return NextResponse.json({ error: "Higher score tiers should not have lower discounts than lower score tiers." }, { status: 400 });
    }
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const before = await loadConfig(supabase).catch(() => null);

    const [limitResult, tiersResult] = await Promise.all([
      supabase
        .from("coupon_config")
        .update({ value: issuanceLimit })
        .eq("key", COUPON_CONFIG_KEYS.issuanceLimit)
        .select("key"),
      supabase
        .from("coupon_config")
        .update({ value: ensureTierQrValues(rewardTiers) })
        .eq("key", COUPON_CONFIG_KEYS.rewardTiers)
        .select("key"),
    ]);

    if (limitResult.error || tiersResult.error) {
      const err = limitResult.error ?? tiersResult.error;
      console.error("Coupon config save failed", err);
      return NextResponse.json({ error: "Failed to save coupon settings." }, { status: 500 });
    }

    console.log("[coupon-config PUT] update results", {
      limitData: limitResult.data,
      tiersData: tiersResult.data,
      limitError: limitResult.error,
      tiersError: tiersResult.error,
    });

    if (!limitResult.data?.length || !tiersResult.data?.length) {
      // Rows don't exist yet — insert them (first-time setup)
      const insertRows = [
        ...(!limitResult.data?.length ? [{ key: COUPON_CONFIG_KEYS.issuanceLimit, value: issuanceLimit }] : []),
        ...(!tiersResult.data?.length ? [{ key: COUPON_CONFIG_KEYS.rewardTiers, value: ensureTierQrValues(rewardTiers) }] : []),
      ];
      console.log("[coupon-config PUT] falling back to insert", insertRows.map((r) => r.key));
      const insertResult = await supabase.from("coupon_config").insert(insertRows);
      if (insertResult.error) {
        console.error("Coupon config insert failed", insertResult.error);
        return NextResponse.json({ error: "Failed to save coupon settings." }, { status: 500 });
      }
    }

    await supabase.from("coupon_config_history").insert([{
      changed_by: session.staffName || session.staffId || session.role,
      changes: {
        before: before ? { issuanceLimit: before.issuanceLimit, rewardTiers: before.rewardTiers } : null,
        after: { issuanceLimit, rewardTiers: ensureTierQrValues(rewardTiers) },
      },
    }]);

    const savedConfig = await loadConfig(supabase);
    console.log("[coupon-config PUT] saved issuanceLimit.max =", savedConfig.issuanceLimit?.max);
    return NextResponse.json(savedConfig);
  } catch (error) {
    console.error("Admin coupon-config PUT route error", error);
    return NextResponse.json({ error: "Failed to save coupon settings." }, { status: 500 });
  }
}
