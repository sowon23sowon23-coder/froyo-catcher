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
    return NextResponse.json({ error: "Login is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = validateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the coupon code." }, { status: 400 });
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
      return NextResponse.json({ error: "Failed to validate the coupon." }, { status: 500 });
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
        reason: "This coupon does not exist.",
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
    return NextResponse.json({ error: "An error occurred while validating the coupon." }, { status: 500 });
  }
}
