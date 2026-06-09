import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServiceSupabaseOrThrow } from "../../../../lib/couponData";
import { COUPON_REDEEM_COOLDOWN_HOURS, getCouponRedeemUnlockIso } from "../../../../lib/coupons";
import { isCompleteBlockActive } from "../../../../lib/gameAccessServer";

const expireWalletCouponSchema = z.object({
  couponId: z.number().int().positive(),
  action: z.enum(["expired", "redeemed"]).optional().default("expired"),
});

export async function POST(req: NextRequest) {
  const completeBlock = await isCompleteBlockActive();
  if (completeBlock) {
    return NextResponse.json({ error: "campaign_ended", message: completeBlock.message }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = expireWalletCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Coupon id is required." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();

    // Fetch coupon to get entry_id for the 24-hour redeem cooldown check.
    const couponLookup = await supabase
      .from("wallet_coupons")
      .select("id,entry_id")
      .eq("id", parsed.data.couponId)
      .maybeSingle();

    if (couponLookup.error || !couponLookup.data?.entry_id) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }

    const entryId = couponLookup.data.entry_id;
    const isRedeemAction = parsed.data.action === "redeemed";

    if (isRedeemAction) {
      const cooldownStart = new Date(Date.now() - COUPON_REDEEM_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      const recentRedeem = await supabase
        .from("wallet_coupons")
        .select("id,redeemed_at")
        .eq("entry_id", entryId)
        .neq("id", parsed.data.couponId)
        .eq("status", "redeemed")
        .gte("redeemed_at", cooldownStart)
        .order("redeemed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRedeem.error) {
        return NextResponse.json({ error: recentRedeem.error.message || "Failed to check coupon cooldown." }, { status: 500 });
      }

      const nextRedeemAvailableAt = getCouponRedeemUnlockIso(recentRedeem.data?.redeemed_at);
      if (nextRedeemAvailableAt && new Date(nextRedeemAvailableAt).getTime() > Date.now()) {
        return NextResponse.json(
          {
            success: false,
            error: "Coupon use is locked for 24 hours after your last redemption.",
            nextRedeemAvailableAt,
          },
          { status: 429 }
        );
      }
    }

    // Conditional on status='active', so only one concurrent caller can consume
    // a given coupon.
    const result = await supabase
      .from("wallet_coupons")
      .update(
        isRedeemAction
          ? {
              status: "redeemed",
              redeemed_at: new Date().toISOString(),
              redeemed_by: "wallet_use_button",
            }
          : { status: "expired" }
      )
      .eq("id", parsed.data.couponId)
      .eq("status", "active")
      .select("id,status,redeemed_at")
      .maybeSingle();

    if (result.error) {
      return NextResponse.json({ error: result.error.message || "Failed to expire coupon." }, { status: 500 });
    }

    const didExpire = Boolean(result.data?.id);

    return NextResponse.json({
      success: true,
      couponId: parsed.data.couponId,
      status: result.data?.status ?? null,
      redeemedAt: result.data?.redeemed_at ?? null,
      expired: didExpire && !isRedeemAction,
      redeemed: didExpire && isRedeemAction,
    });
  } catch (error) {
    console.error("Wallet coupon expire route error", error);
    return NextResponse.json({ error: "An error occurred while expiring the coupon." }, { status: 500 });
  }
}
