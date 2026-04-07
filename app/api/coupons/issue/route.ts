import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, issueCouponSchema } from "../../../lib/couponData";
import { getEligibleCouponReward, getCouponExpiryIso } from "../../../lib/coupons";
import { type EntryContactType, normalizeEmail, normalizeUsPhone } from "../../../lib/entry";
import { requireAuthenticatedEntry } from "../../../lib/serverEntrySession";
import {
  buildRedeemUrl,
  COUPON_SCORE_THRESHOLD,
  createCouponCode,
} from "../../../lib/couponMvp";

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

    if (!nickname || !contactType || !normalizedContact) {
      const failedAuth = auth as Extract<typeof auth, { ok: false }>;
      return NextResponse.json({ error: failedAuth.error }, { status: failedAuth.status });
    }

    supabase = getServiceSupabaseOrThrow();
    const fallbackEntry = await supabase
      .from("entries")
      .select("id,nickname_display")
      .eq("contact_type", contactType)
      .eq("contact_value", normalizedContact)
      .maybeSingle();

    if (fallbackEntry.error || !fallbackEntry.data?.id) {
      return NextResponse.json({ error: "Login session is required." }, { status: 401 });
    }

    entry = {
      id: Number(fallbackEntry.data.id),
      nickname: String(fallbackEntry.data.nickname_display || nickname).trim() || nickname,
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
      .select("id,title,description,reward_type,expires_at,redeem_token,created_at")
      .eq("game_session_id", gameSessionId)
      .maybeSingle();

    if (existingWallet.error) {
      console.error("Wallet coupon lookup failed", existingWallet.error);
      return NextResponse.json({ error: "Failed to look up wallet coupon." }, { status: 500 });
    }

    if (existingWallet.data?.id) {
      const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
      const redeemUrl = buildRedeemUrl(origin, String(existingWallet.data.redeem_token));

      return NextResponse.json({
        eligible: true,
        issued: true,
        coupon: {
          id: Number(existingWallet.data.id),
          title: String(existingWallet.data.title || reward.title),
          couponName: String(existingWallet.data.title || reward.title),
          description: String(existingWallet.data.description || reward.description),
          rewardType: String(existingWallet.data.reward_type || reward.type),
          expiresAt: String(existingWallet.data.expires_at || expiresAt),
          issuedAt: String(existingWallet.data.created_at || ""),
          redeemToken: String(existingWallet.data.redeem_token),
        },
        qrPayload: redeemUrl,
        redeemUrl,
      });
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
      .select("id,title,reward_type,expires_at,redeem_token,created_at")
      .single();

    if (walletCoupon.error || !walletCoupon.data?.id) {
      console.error("Wallet coupon issue failed", walletCoupon.error);
      return NextResponse.json({ error: "Failed to issue wallet coupon." }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redeemUrl = buildRedeemUrl(origin, redeemToken);

    return NextResponse.json({
      eligible: true,
      issued: true,
      coupon: {
        id: Number(walletCoupon.data.id),
        title: reward.title,
        couponName: reward.title,
        description: reward.description,
        rewardType: reward.type,
        status: "active",
        issuedAt: String(walletCoupon.data.created_at || ""),
        expiresAt,
        redeemToken,
      },
      qrPayload: redeemUrl,
      redeemUrl,
    });
  } catch (error) {
    console.error("Coupon issue route error", error);
    return NextResponse.json({ error: "An error occurred while issuing the coupon." }, { status: 500 });
  }
}
