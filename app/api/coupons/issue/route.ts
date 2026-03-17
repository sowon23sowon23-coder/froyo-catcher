import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, issueCouponSchema } from "../../../lib/couponData";
import {
  buildRedeemUrl,
  COUPON_NAME,
  COUPON_REWARD_TYPE,
  COUPON_SCORE_THRESHOLD,
  createCouponCode,
  DEFAULT_DISCOUNT_AMOUNT,
  getCouponExpiryIso,
} from "../../../lib/couponMvp";

async function createUniqueCouponCode() {
  const supabase = getServiceSupabaseOrThrow();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createCouponCode();
    const existing = await supabase.from("coupons").select("id").eq("code", code).maybeSingle();
    if (!existing.data?.id) return code;
  }

  throw new Error("Failed to create a unique coupon code.");
}

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const parsed = issueCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId와 score를 다시 확인해 주세요." }, { status: 400 });
  }

  const { score, userId } = parsed.data;
  if (score < COUPON_SCORE_THRESHOLD) {
    return NextResponse.json({
      eligible: false,
      reason: `점수 ${COUPON_SCORE_THRESHOLD}점 이상일 때 쿠폰이 발급됩니다.`,
    });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const code = await createUniqueCouponCode();
    const expiresAt = getCouponExpiryIso();
    const inserted = await supabase
      .from("coupons")
      .insert([
        {
          code,
          user_id: userId || null,
          coupon_name: COUPON_NAME,
          reward_type: COUPON_REWARD_TYPE,
          discount_amount: DEFAULT_DISCOUNT_AMOUNT,
          status: "unused",
          issued_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
      ])
      .select("*")
      .single();

    if (inserted.error) {
      console.error("Coupon issue failed", inserted.error);
      return NextResponse.json({ error: "쿠폰 발급에 실패했습니다." }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redeemUrl = buildRedeemUrl(origin, code);

    return NextResponse.json({
      eligible: true,
      coupon: {
        id: inserted.data.id,
        code,
        couponName: COUPON_NAME,
        rewardType: COUPON_REWARD_TYPE,
        discountAmount: DEFAULT_DISCOUNT_AMOUNT,
        status: "unused",
        issuedAt: inserted.data.issued_at,
        expiresAt,
        userId: userId || null,
      },
      qrPayload: redeemUrl,
      redeemUrl,
    });
  } catch (error) {
    console.error("Coupon issue route error", error);
    return NextResponse.json({ error: "쿠폰 발급 중 오류가 발생했습니다." }, { status: 500 });
  }
}
