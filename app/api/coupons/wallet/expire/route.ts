import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServiceSupabaseOrThrow } from "../../../../lib/couponData";

const expireWalletCouponSchema = z.object({
  couponId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
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

    // Safety net: enforce max 1 activation per account per calendar day (UTC).
    // Primary enforcement is client-side via canActivateToday from the wallet fetch.
    const couponLookup = await supabase
      .from("wallet_coupons")
      .select("id,entry_id,created_at")
      .eq("id", parsed.data.couponId)
      .maybeSingle();

    if (couponLookup.error || !couponLookup.data?.entry_id) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }

    const entryId = couponLookup.data.entry_id;
    const todayMidnightUtc = new Date();
    todayMidnightUtc.setUTCHours(0, 0, 0, 0);

    const activatedToday = await supabase
      .from("wallet_coupons")
      .select("id", { count: "exact", head: true })
      .eq("entry_id", entryId)
      .eq("status", "expired")
      .gte("created_at", todayMidnightUtc.toISOString());

    if (!activatedToday.error && (activatedToday.count ?? 0) >= 1) {
      return NextResponse.json(
        { success: false, error: "Daily activation limit reached. Only 1 coupon can be used per day." },
        { status: 429 }
      );
    }

    const result = await supabase
      .from("wallet_coupons")
      .update({ status: "expired" })
      .eq("id", parsed.data.couponId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (result.error) {
      return NextResponse.json({ error: result.error.message || "Failed to expire coupon." }, { status: 500 });
    }

    return NextResponse.json({ success: true, couponId: parsed.data.couponId, expired: Boolean(result.data?.id) });
  } catch (error) {
    console.error("Wallet coupon expire route error", error);
    return NextResponse.json({ error: "An error occurred while expiring the coupon." }, { status: 500 });
  }
}
