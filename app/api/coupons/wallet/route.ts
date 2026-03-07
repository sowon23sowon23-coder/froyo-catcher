import { NextRequest, NextResponse } from "next/server";
import { getCouponState, getWalletCouponStatus } from "../../../lib/coupons";
import { requireAuthenticatedEntry } from "../../../lib/serverEntrySession";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedEntry(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, entry } = auth;

  const rows = await supabase
    .from("wallet_coupons")
    .select("id,reward_type,title,description,status,expires_at,redeem_token,created_at,redeemed_at,redeemed_staff_name,redeemed_store_name")
    .eq("entry_id", entry.id)
    .order("created_at", { ascending: false });

  if (rows.error) {
    return NextResponse.json({ error: rows.error.message || "Failed to load wallet." }, { status: 500 });
  }

  const coupons = (rows.data ?? []).map((row) => {
    const state = getCouponState({
      status: row.status,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at,
    });
    return {
      id: Number(row.id),
      rewardType: row.reward_type,
      title: row.title,
      description: row.description,
      status: getWalletCouponStatus({
        status: row.status,
        expiresAt: row.expires_at,
        redeemedAt: row.redeemed_at,
      }),
      state,
      expiresAt: row.expires_at,
      redeemToken: row.redeem_token,
      createdAt: row.created_at,
      redeemedAt: row.redeemed_at,
      redeemedStaffName: row.redeemed_staff_name,
      redeemedStoreName: row.redeemed_store_name,
    };
  });

  return NextResponse.json({
    nickname: entry.nickname,
    coupons,
    activeCoupons: coupons.filter((coupon) => coupon.status === "active"),
    historyCoupons: coupons.filter((coupon) => coupon.status !== "active"),
  });
}
