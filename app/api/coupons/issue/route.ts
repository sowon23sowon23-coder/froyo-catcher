import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, issueCouponSchema } from "../../../lib/couponData";
import {
  COUPON_CONFIG_KEYS,
  getCouponExpiryIso,
  getEligibleConfiguredCouponReward,
  resolveCouponReward,
  type CouponIssuanceLimitConfig,
} from "../../../lib/coupons";
import { type EntryContactType, normalizeEmail, normalizeUsPhone } from "../../../lib/entry";
import { requireAuthenticatedEntry } from "../../../lib/serverEntrySession";
import { COUPON_SCORE_THRESHOLD, createCouponCode } from "../../../lib/couponMvp";

async function createUniqueRedeemToken(supabase: any) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = createCouponCode();
    const existing = await supabase.from("wallet_coupons").select("id").eq("redeem_token", token).maybeSingle();
    if (!existing.data?.id) return token;
  }

  throw new Error("Failed to create a unique redeem token.");
}

function normalizeContactValue(contactType: EntryContactType, value: string) {
  return contactType === "phone" ? normalizeUsPhone(value) : normalizeEmail(value);
}

function serializeIssuedCoupon(row: {
  id?: number | null;
  title?: string | null;
  description?: string | null;
  reward_type?: string | null;
  expires_at?: string | null;
  redeem_token?: string | null;
  created_at?: string | null;
}) {
  const reward = resolveCouponReward(row.reward_type, row.title, row.description);

  return {
    id: Number(row.id || 0),
    title: String(row.title || reward?.title || ""),
    couponName: String(row.title || reward?.title || ""),
    description: String(row.description || reward?.description || ""),
    rewardType: String(reward?.type || row.reward_type || ""),
    expiresAt: String(row.expires_at || ""),
    issuedAt: String(row.created_at || ""),
    redeemToken: String(row.redeem_token || ""),
  };
}

async function getIssuanceLimitConfig(supabase: any): Promise<CouponIssuanceLimitConfig | null> {
  const result = await supabase
    .from("coupon_config")
    .select("value")
    .eq("key", COUPON_CONFIG_KEYS.issuanceLimit)
    .maybeSingle();

  if (result.error) {
    console.error("Coupon issuance limit config lookup failed", result.error);
    return null;
  }

  const value = result.data?.value as Partial<CouponIssuanceLimitConfig> | null | undefined;
  const type = value?.type === "campaign" ? "campaign" : value?.type === "daily" ? "daily" : null;
  const max = Number(value?.max);
  if (!type || !Number.isInteger(max) || max < 1) return null;

  return {
    type,
    max,
    stopOnReach: value?.stopOnReach !== false,
  };
}

async function getCurrentIssuanceCount(supabase: any, config: CouponIssuanceLimitConfig) {
  let query = supabase.from("wallet_coupons").select("id", { count: "exact", head: true });

  if (config.type === "daily") {
    const todayMidnightUtc = new Date();
    todayMidnightUtc.setUTCHours(0, 0, 0, 0);
    query = query.gte("created_at", todayMidnightUtc.toISOString());
  }

  const result = await query;
  if (result.error) {
    console.error("Coupon issuance limit count lookup failed", result.error);
    throw new Error("Failed to check coupon issuance limit.");
  }

  return result.count ?? 0;
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = issueCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the userId and score." }, { status: 400 });
  }

  const auth = await requireAuthenticatedEntry(req);
  let supabase: any;
  let entry: { id: number; nickname: string };

  if (auth.ok) {
    supabase = auth.supabase;
    entry = auth.entry;
  } else {
    const nickname = String(parsed.data.nickname || "").trim();
    const contactType = parsed.data.contactType;
    const contactValue = String(parsed.data.contactValue || "").trim();
    const normalizedContact =
      contactType && contactValue ? normalizeContactValue(contactType, contactValue) : null;

    if (!nickname) {
      const failedAuth = auth as Extract<typeof auth, { ok: false }>;
      return NextResponse.json({ error: failedAuth.error }, { status: failedAuth.status });
    }

    supabase = getServiceSupabaseOrThrow();
    let resolvedEntry: { id?: number | null; nickname_display?: string | null } | null = null;
    let fallbackError: { message?: string } | null = null;

    if (contactType && normalizedContact) {
      const fallbackEntry = await supabase
        .from("entries")
        .select("id,nickname_display")
        .eq("contact_type", contactType)
        .eq("contact_value", normalizedContact)
        .maybeSingle();

      if (fallbackEntry.error) {
        fallbackError = fallbackEntry.error;
      } else if (fallbackEntry.data?.id) {
        resolvedEntry = fallbackEntry.data;
      }
    }

    if (!resolvedEntry?.id) {
      const nicknameEntry = await supabase
        .from("entries")
        .select("id,nickname_display")
        .eq("nickname_key", nickname.toLowerCase())
        .maybeSingle();

      if (nicknameEntry.error) {
        fallbackError = nicknameEntry.error;
      } else if (nicknameEntry.data?.id) {
        resolvedEntry = nicknameEntry.data;
      }
    }

    if (!resolvedEntry?.id) {
      if (fallbackError) {
        console.error("Coupon issue fallback entry lookup failed", fallbackError);
      }
      return NextResponse.json({ error: "Login session is required." }, { status: 401 });
    }

    entry = {
      id: Number(resolvedEntry.id),
      nickname: String(resolvedEntry.nickname_display || nickname).trim() || nickname,
    };
  }

  const { score, gameSessionId, mode } = parsed.data;
  const reward = await getEligibleConfiguredCouponReward(supabase, score);

  if (!reward || score < COUPON_SCORE_THRESHOLD) {
    return NextResponse.json({
      eligible: false,
      issued: false,
      reason: `Coupons are issued only when the score is ${COUPON_SCORE_THRESHOLD} or higher.`,
    });
  }

  try {
    const expiresAt = getCouponExpiryIso();

    const issuanceLimit = await getIssuanceLimitConfig(supabase);
    if (issuanceLimit?.stopOnReach) {
      const currentIssueCount = await getCurrentIssuanceCount(supabase, issuanceLimit);
      if (currentIssueCount >= issuanceLimit.max) {
        const reason = issuanceLimit.type === "daily" ? "daily_limit_reached" : "campaign_limit_reached";
        return NextResponse.json({
          eligible: true,
          issued: false,
          reason,
          message: issuanceLimit.type === "daily"
            ? "Today's coupons are all gone."
            : "This campaign's coupons are all gone.",
        });
      }
    }

    // Policy: max 2 coupons issued per account per calendar day (UTC)
    const todayMidnightUtc = new Date();
    todayMidnightUtc.setUTCHours(0, 0, 0, 0);

    const issuedTodayResult = await supabase
      .from("wallet_coupons")
      .select("id", { count: "exact", head: true })
      .eq("entry_id", entry.id)
      .gte("created_at", todayMidnightUtc.toISOString());

    if (issuedTodayResult.error) {
      console.error("Daily issue count lookup failed", issuedTodayResult.error);
      return NextResponse.json({ error: "Failed to check daily issue limit." }, { status: 500 });
    }

    const issuedTodayCount = issuedTodayResult.count ?? 0;
    if (issuedTodayCount >= 1) {
      return NextResponse.json({
        eligible: true,
        issued: false,
        reason: "Daily issuance limit reached. You can receive 1 coupon per day.",
      });
    }

    const evaluation = await supabase
      .from("coupon_reward_evaluations")
      .insert([{ entry_id: entry.id, game_session_id: gameSessionId, game_mode: mode, score, reward_type: reward.type }])
      .select("id")
      .single();

    if (evaluation.error || !evaluation.data?.id) {
      console.error("Coupon evaluation failed", evaluation.error);
      return NextResponse.json({
        error: "Failed to create coupon evaluation.",
        detail: evaluation.error?.message ?? null,
        hint: evaluation.error?.hint ?? null,
      }, { status: 500 });
    }

    const redeemToken = await createUniqueRedeemToken(supabase);
    const walletCoupon = await supabase
      .from("wallet_coupons")
      .insert([{
        evaluation_id: Number(evaluation.data.id),
        entry_id: entry.id,
        game_session_id: gameSessionId,
        reward_type: reward.type,
        title: reward.title,
        description: reward.description,
        status: "active",
        redeem_token: redeemToken,
        expires_at: expiresAt,
      }])
      .select("id,title,description,reward_type,expires_at,redeem_token,created_at")
      .single();

    if (walletCoupon.error || !walletCoupon.data?.id) {
      console.error("Wallet coupon issue failed", walletCoupon.error);
      return NextResponse.json({
        error: "Failed to issue wallet coupon.",
        detail: walletCoupon.error?.message ?? null,
        hint: walletCoupon.error?.hint ?? null,
      }, { status: 500 });
    }

    return NextResponse.json({
      eligible: true,
      issued: true,
      coupon: serializeIssuedCoupon(walletCoupon.data),
      qrPayload: reward.fixedQrValue,
    });
  } catch (error) {
    console.error("Coupon issue route error", error);
    return NextResponse.json({ error: "An error occurred while issuing the coupon." }, { status: 500 });
  }
}
