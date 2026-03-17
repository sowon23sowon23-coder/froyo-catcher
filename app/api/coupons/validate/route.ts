import { NextRequest, NextResponse } from "next/server";

import {
  ensureCouponExpiredIfNeeded,
  getServiceSupabaseOrThrow,
  logCouponAction,
  serializeCouponSummary,
  validateCouponSchema,
} from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["admin", "staff"]);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = validateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "쿠폰 코드를 확인해 주세요." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const result = await supabase
      .from("coupons")
      .select("*")
      .eq("code", parsed.data.code.toUpperCase())
      .maybeSingle();

    if (result.error) {
      console.error("Coupon validate failed", result.error);
      return NextResponse.json({ error: "쿠폰 검증에 실패했습니다." }, { status: 500 });
    }

    if (!result.data) {
      await logCouponAction({
        code: parsed.data.code,
        actionType: "validate",
        reason: "invalid_code",
        storeId: session.storeId,
        staffId: session.staffId,
      });

      return NextResponse.json({
        valid: false,
        status: "invalid",
        reason: "존재하지 않는 쿠폰입니다.",
        coupon: null,
      });
    }

    const status = await ensureCouponExpiredIfNeeded(result.data);
    const coupon = serializeCouponSummary(result.data, status);
    await logCouponAction({
      couponId: coupon.id,
      code: coupon.code,
      actionType: "validate",
      reason: status,
      storeId: session.storeId,
      staffId: session.staffId,
    });

    return NextResponse.json({
      valid: status === "unused",
      status,
      reason: coupon.reason,
      coupon,
    });
  } catch (error) {
    console.error("Coupon validate route error", error);
    return NextResponse.json({ error: "쿠폰 검증 중 오류가 발생했습니다." }, { status: 500 });
  }
}
