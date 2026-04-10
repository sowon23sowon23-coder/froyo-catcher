import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, issueCouponSchema } from "../../../lib/couponData";
import {
  getCouponExpiryIso,
  getCouponRewardByType,
  getEligibleCouponReward,
  getWalletCouponStatus,
  resolveCouponReward,
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
    rewardType: String(row.reward_type || reward?.type || ""),
    expiresAt: String(row.expires_at || ""),
    issuedAt: String(row.created_at || ""),
    redeemToken: String(row.redeem_token || ""),
  };
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
  const reward = getEligibleCouponReward(score);

  if (!reward || score < COUPON_SCORE_THRESHOLD) {
    return NextResponse.json({
      eligible: false,
      issued: false,
      reason: `Coupons are issued only when the score is ${COUPON_SCORE_THRESHOLD} or higher.`,
    });
  }

  try {
    const expiresAt = getCouponExpiryIso();
    const existingWallet = await supabase
      .from("wallet_coupons")
      .select("id,title,description,reward_type,status,expires_at,redeem_token,created_at,redeemed_at")
      .eq("entry_id", entry.id)
      .order("created_at", { ascending: false });

    if (existingWallet.error) {
      console.error("Wallet coupon lookup failed", existingWallet.error);
      return NextResponse.json({ error: "Failed to look up wallet coupon." }, { status: 500 });
    }

    const activeCoupons = (existingWallet.data ?? []).filter((walletCoupon) => {
      const status = getWalletCouponStatus({
        status: walletCoupon.status,
        expiresAt: walletCoupon.expires_at,
        redeemedAt: walletCoupon.redeemed_at,
      });
      return status === "active";
    });

    const bestActiveCoupon = activeCoupons
      .map((walletCoupon) => ({
        row: walletCoupon,
        reward: resolveCouponReward(walletCoupon.reward_type, walletCoupon.title, walletCoupon.description),
      }))
      .filter((item): item is { row: (typeof activeCoupons)[number]; reward: NonNullable<ReturnType<typeof getCouponRewardByType>> } => Boolean(item.reward))
      .sort((a, b) => b.reward.threshold - a.reward.threshold)[0];

    if (bestActiveCoupon && bestActiveCoupon.reward.threshold >= reward.threshold) {
      return NextResponse.json({
        eligible: true,
        issued: false,
        coupon: serializeIssuedCoupon(bestActiveCoupon.row),
        qrPayload: bestActiveCoupon.reward.fixedQrValue,
      });
    }

    const lowerTierCouponIds = activeCoupons
      .filter((walletCoupon) => {
        const activeReward = resolveCouponReward(walletCoupon.reward_type, walletCoupon.title, walletCoupon.description);
        return activeReward && activeReward.threshold < reward.threshold;
      })
      .map((walletCoupon) => Number(walletCoupon.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (lowerTierCouponIds.length > 0) {
      const expireResult = await supabase
        .from("wallet_coupons")
        .update({ status: "expired" })
        .in("id", lowerTierCouponIds)
        .eq("status", "active");

      if (expireResult.error) {
        console.error("Failed to retire lower-tier coupons", expireResult.error);
        return NextResponse.json({ error: "Failed to replace lower-tier coupon." }, { status: 500 });
      }
    }

    const evaluation = await supabase
      .from("coupon_reward_evaluations")
      .insert([
        {
          entry_id: entry.id,
          game_session_id: gameSessionId,
          game_mode: mode,
          score,
          reward_type: reward.type,
        },
      ])
      .select("id")
      .single();

    if (evaluation.error || !evaluation.data?.id) {
      console.error("Coupon evaluation failed", evaluation.error);
      return NextResponse.json({ error: "Failed to create coupon evaluation." }, { status: 500 });
    }

    const redeemToken = await createUniqueRedeemToken(supabase);
    const walletCoupon = await supabase
      .from("wallet_coupons")
      .insert([
        {
          evaluation_id: Number(evaluation.data.id),
          entry_id: entry.id,
          game_session_id: gameSessionId,
          reward_type: reward.type,
          title: reward.title,
          description: reward.description,
          status: "active",
          redeem_token: redeemToken,
          expires_at: expiresAt,
        },
      ])
      .select("id,title,description,reward_type,expires_at,redeem_token,created_at")
      .single();

    if (walletCoupon.error || !walletCoupon.data?.id) {
      console.error("Wallet coupon issue failed", walletCoupon.error);
      return NextResponse.json({ error: "Failed to issue wallet coupon." }, { status: 500 });
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
