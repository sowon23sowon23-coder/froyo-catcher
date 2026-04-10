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
