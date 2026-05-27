import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServiceSupabaseOrThrow } from "../../../../lib/couponData";
import { getDallasDayStart } from "../../../../lib/dallasTime";
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

    // Fetch coupon to get entry_id for the daily-limit check.
    const couponLookup = await supabase
      .from("wallet_coupons")
      .select("id,entry_id")
      .eq("id", parsed.data.couponId)
      .maybeSingle();

    if (couponLookup.error || !couponLookup.data?.entry_id) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }

    const entryId = couponLookup.data.entry_id;
    const todayMidnightDallas = getDallasDayStart();
    const isRedeemAction = parsed.data.action === "redeemed";

    // Attempt the update first (conditional on status='active').
    // This acts as a lightweight lock: only one concurrent caller can flip a
    // given coupon from active → expired. We verify the daily cap AFTER the
    // update and revert if exceeded, which collapses the race window compared
    // to checking before.
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

    if (didExpire) {
      // Count how many coupons for this entry were expired (activated) today,
      // including the one we just flipped.
      const activatedToday = await supabase
        .from("wallet_coupons")
        .select("id", { count: "exact", head: true })
        .eq("entry_id", entryId)
        .in("status", ["expired", "redeemed"])
        .gte("created_at", todayMidnightDallas.toISOString());

      if (!activatedToday.error && (activatedToday.count ?? 0) > 1) {
        // Daily limit exceeded — revert this coupon back to active.
        await supabase
          .from("wallet_coupons")
          .update({ status: "active" })
          .eq("id", parsed.data.couponId);

        return NextResponse.json(
          { success: false, error: "Daily activation limit reached. Only 1 coupon can be used per day." },
          { status: 429 }
        );
      }
    }

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
