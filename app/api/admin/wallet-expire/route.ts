import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  let body: { walletCouponId?: unknown };
  try {
    body = (await req.json()) as { walletCouponId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const walletCouponId = Number(body.walletCouponId);
  if (!Number.isInteger(walletCouponId) || walletCouponId <= 0) {
    return NextResponse.json({ error: "Invalid walletCouponId." }, { status: 400 });
  }

  const supabase = getServiceSupabaseOrThrow();

  const { data, error } = await supabase
    .from("wallet_coupons")
    .update({ status: "expired" })
    .eq("id", walletCouponId)
    .eq("status", "active")
    .select("id");

  if (error) {
    return NextResponse.json({ error: "Failed to expire coupon." }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Coupon not found or already inactive." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
