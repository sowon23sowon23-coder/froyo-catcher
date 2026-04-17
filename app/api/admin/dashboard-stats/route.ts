import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { buildChartSeries, getCouponStatus } from "../../../lib/couponMvp";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  try {
    const supabase = getServiceSupabaseOrThrow();

    const [couponsResult, sessionsResult, redeemLogsResult] = await Promise.all([
      supabase
        .from("wallet_coupons")
        .select("id,status,expires_at,redeemed_at,created_at,reward_type")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("game_sessions")
        .select("id,score,coupon_issued,completed,created_at")
        .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from("redeem_logs")
        .select("id,action_type,store_id,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const coupons = couponsResult.data ?? [];
    const sessions = sessionsResult.data ?? [];

    // Coupon stats
    let issued = 0, redeemed = 0, expired = 0, active = 0;
    const issueDates: string[] = [];
    const redeemDates: string[] = [];

    for (const c of coupons) {
      issued++;
      if (c.created_at) issueDates.push(String(c.created_at));
      const now = new Date();
      const isExpiredByTime = c.expires_at && new Date(c.expires_at) < now;
      if (c.redeemed_at || c.status === "used") {
        redeemed++;
        if (c.redeemed_at) redeemDates.push(String(c.redeemed_at));
      } else if (c.status === "expired" || isExpiredByTime) {
        expired++;
      } else {
        active++;
      }
    }

    // Coupon → redeem conversion rate
    const redeemRate = issued > 0 ? Number(((redeemed / issued) * 100).toFixed(1)) : 0;

    // Game session stats (last 14 days)
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed).length;
    const couponIssuedFromGame = sessions.filter((s) => s.coupon_issued).length;
    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;
    const gameToConversionRate = completedSessions > 0
      ? Math.round((couponIssuedFromGame / completedSessions) * 100)
      : 0;

    // Funnel (last 14 days, approximated)
    const funnel = [
      { label: "게임 시작", value: totalSessions },
      { label: "게임 완료", value: completedSessions },
      { label: "쿠폰 발급", value: couponIssuedFromGame },
      { label: "쿠폰 사용", value: redeemed },
    ];

    return NextResponse.json({
      coupons: { issued, redeemed, expired, active, redeemRate },
      game: { totalSessions, completedSessions, completionRate, couponIssuedFromGame, gameToConversionRate },
      funnel,
      charts: {
        issuedByDay: buildChartSeries(14, issueDates),
        redeemedByDay: buildChartSeries(14, redeemDates),
      },
      recentRedeems: redeemLogsResult.data ?? [],
    });
  } catch (err) {
    console.error("dashboard-stats error", err);
    return NextResponse.json({ error: "An error occurred." }, { status: 500 });
  }
}
