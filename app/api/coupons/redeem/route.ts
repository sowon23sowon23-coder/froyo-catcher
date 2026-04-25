import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, redeemCouponSchema, serializeCouponSummary } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["staff"]);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in as staff to redeem coupons." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = redeemCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the code and staff information." }, { status: 400 });
  }

  const { code, storeId, staffId, orderNumber } = parsed.data;
  if (session.storeId !== storeId || session.staffId !== staffId) {
    return NextResponse.json({ error: "The logged-in staff information does not match this request." }, { status: 403 });
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
      return NextResponse.json({ error: "Failed to redeem the coupon." }, { status: 500 });
    }

    const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
    if (!row) {
      return NextResponse.json({ error: "Could not verify the redeem result." }, { status: 500 });
    }

    let rewardType = "score_discount";
    if (row.coupon_id) {
      const couponLookup = await supabase
        .from("coupons")
        .select("reward_type")
        .eq("id", row.coupon_id)
        .maybeSingle();

      if (couponLookup.error) {
        console.error("Coupon reward type lookup failed", couponLookup.error);
      } else if (couponLookup.data?.reward_type) {
        rewardType = String(couponLookup.data.reward_type);
      }
    }

    const coupon = row.coupon_id
      ? serializeCouponSummary(
          {
            id: row.coupon_id,
            code: row.coupon_code,
            coupon_name: row.coupon_name,
            reward_type: rewardType,
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
              ? "This coupon has already been used."
              : row.reason === "expired"
                ? "This coupon has expired."
                : "This coupon does not exist.",
          coupon,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "used",
      reason: "Coupon redeemed successfully.",
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
    return NextResponse.json({ error: "An error occurred while redeeming the coupon." }, { status: 500 });
  }
}
