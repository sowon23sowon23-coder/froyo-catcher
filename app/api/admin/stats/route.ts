import { NextRequest, NextResponse } from "next/server";

import { buildChartSeries, getCouponStatus } from "../../../lib/couponMvp";
import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "Admin login is required." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const [couponsResult, recentLogsResult] = await Promise.all([
      supabase
        .from("coupons")
        .select("id,code,status,issued_at,expires_at,redeemed_at,redeemed_store_id")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("redeem_logs")
        .select("id,code,action_type,reason,store_id,staff_id,order_number,created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (couponsResult.error) {
      console.error("Failed to load coupon stats", couponsResult.error);
      return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
    }
    if (recentLogsResult.error) {
      console.error("Failed to load recent logs", recentLogsResult.error);
      return NextResponse.json({ error: "Failed to load logs." }, { status: 500 });
    }

    const rows = couponsResult.data ?? [];
    const totals = { issued: rows.length, used: 0, unused: 0, expired: 0 };
    const storeUsage = new Map<string, number>();
    const issueDates: string[] = [];
    const redeemDates: string[] = [];

    for (const row of rows) {
      const effectiveStatus = getCouponStatus(row);
      if (row.issued_at) issueDates.push(String(row.issued_at));
      if (effectiveStatus === "used") {
        totals.used += 1;
        if (row.redeemed_at) redeemDates.push(String(row.redeemed_at));
        if (row.redeemed_store_id) {
          storeUsage.set(String(row.redeemed_store_id), (storeUsage.get(String(row.redeemed_store_id)) || 0) + 1);
        }
      } else if (effectiveStatus === "expired") {
        totals.expired += 1;
      } else {
        totals.unused += 1;
      }
    }

    const usageRate = totals.issued > 0 ? Number(((totals.used / totals.issued) * 100).toFixed(1)) : 0;

    return NextResponse.json({
      totals: {
        issued: totals.issued,
        redeemed: totals.used,
        usageRate,
      },
      statusCounts: {
        unused: totals.unused,
        used: totals.used,
        expired: totals.expired,
      },
      recentLogs: recentLogsResult.data ?? [],
      charts: {
        issuedByDay: buildChartSeries(14, issueDates),
        redeemedByDay: buildChartSeries(14, redeemDates),
      },
      storeUsage: Array.from(storeUsage.entries())
        .map(([storeId, count]) => ({ storeId, count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    console.error("Admin stats route error", error);
    return NextResponse.json({ error: "An error occurred while loading stats." }, { status: 500 });
  }
}
