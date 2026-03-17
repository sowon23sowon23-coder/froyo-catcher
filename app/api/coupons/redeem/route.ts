import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, redeemCouponSchema, serializeCouponSummary } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["staff"]);
  if (!session) {
    return NextResponse.json({ error: "직원 로그인 후 사용할 수 있습니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = redeemCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "코드와 직원 정보를 확인해 주세요." }, { status: 400 });
  }

  const { code, storeId, staffId, orderNumber } = parsed.data;
  if (session.storeId !== storeId || session.staffId !== staffId) {
    return NextResponse.json({ error: "현재 로그인한 직원 정보와 요청값이 일치하지 않습니다." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const rpcResult = await supabase.rpc("redeem_coupon_atomic", {
      p_code: code.toUpperCase(),
      p_store_id: storeId,
      p_staff_id: staffId,
      p_order_number: orderNumber || null,
    });

    if (rpcResult.error) {
      console.error("Coupon redeem rpc failed", rpcResult.error);
      return NextResponse.json({ error: "사용 처리에 실패했습니다." }, { status: 500 });
    }

    const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    if (!row) {
      return NextResponse.json({ error: "사용 처리 결과를 확인할 수 없습니다." }, { status: 500 });
    }

    const coupon = row.coupon_id
      ? serializeCouponSummary(
          {
            id: row.coupon_id,
            code: row.coupon_code,
            coupon_name: row.coupon_name,
            reward_type: "score_discount",
            discount_amount: row.discount_amount,
            status: row.status,
            issued_at: null,
            expires_at: row.expires_at,
            redeemed_at: row.redeemed_at,
            redeemed_store_id: row.redeemed_store_id,
            redeemed_staff_id: row.redeemed_staff_id,
            order_number: row.order_number,
          },
          row.status === "invalid" ? "invalid" : row.status
        )
      : null;

    if (!row.ok) {
      return NextResponse.json(
        {
          success: false,
          status: row.status,
          reason:
            row.reason === "already_used"
              ? "이미 사용된 쿠폰입니다."
              : row.reason === "expired"
                ? "만료된 쿠폰입니다."
                : "존재하지 않는 쿠폰입니다.",
          coupon,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "used",
      reason: "사용 처리 완료",
      coupon,
      redeem: {
        redeemedAt: row.redeemed_at,
        storeId: row.redeemed_store_id,
        staffId: row.redeemed_staff_id,
        orderNumber: row.order_number,
      },
    });
  } catch (error) {
    console.error("Coupon redeem route error", error);
    return NextResponse.json({ error: "사용 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
