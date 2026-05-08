import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { buildChartSeries, getCouponStatus } from "../../../lib/couponMvp";
import { COUPON_CONFIG_KEYS, type CouponIssuanceLimitConfig } from "../../../lib/coupons";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return value;
}

function getDateRange(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  const dateParam = parseDate(req.nextUrl.searchParams.get("date"));
  const startParam = parseDate(req.nextUrl.searchParams.get("startDate"));
  const endParam = parseDate(req.nextUrl.searchParams.get("endDate"));

  const rangeStart = mode === "range" ? startParam : dateParam;
  const rangeEnd = mode === "range" ? endParam : dateParam;
  if (!rangeStart || !rangeEnd) return null;

  const start = new Date(`${rangeStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(`${rangeEnd}T00:00:00.000Z`);
  if (Number.isNaN(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() + 1);
  if (start.getTime() >= end.getTime()) return null;

  return {
    mode: mode === "range" ? "range" : "day",
    date: mode === "range" ? null : rangeStart,
    startDate: rangeStart,
    endDate: rangeEnd,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function buildRangeChartSeries(startDate: string, endDate: string, timestamps: string[]) {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const key = new Date(timestamp).toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: Array<{ date: string; count: number }> = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime() && series.length < 62) {
    const key = cursor.toISOString().slice(0, 10);
    series.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  try {
    const supabase = getServiceSupabaseOrThrow();
    const dateRange = getDateRange(req);

    let couponsQuery = supabase
      .from("wallet_coupons")
      .select("id,status,expires_at,redeemed_at,created_at,reward_type")
      .order("created_at", { ascending: false })
      .limit(5000);
    let sessionsQuery = supabase
      .from("game_sessions")
      .select("id,score,coupon_issued,completed,created_at");
    let redeemLogsQuery = supabase
      .from("redeem_logs")
      .select("id,action_type,store_id,created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (dateRange) {
      couponsQuery = couponsQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
      sessionsQuery = sessionsQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
      redeemLogsQuery = redeemLogsQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
    } else {
      sessionsQuery = sessionsQuery.gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
    }

    const [couponsResult, sessionsResult, redeemLogsResult, couponConfigResult] = await Promise.all([
      couponsQuery,
      sessionsQuery,
      redeemLogsQuery,
      supabase
        .from("coupon_config")
        .select("value")
        .eq("key", COUPON_CONFIG_KEYS.issuanceLimit)
        .maybeSingle(),
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
    const rawIssuanceLimit = couponConfigResult.data?.value as Partial<CouponIssuanceLimitConfig> | null | undefined;
    const limitType = rawIssuanceLimit?.type === "campaign" ? "campaign" : rawIssuanceLimit?.type === "daily" ? "daily" : null;
    const limitMax = Number(rawIssuanceLimit?.max);
    const todayMidnightUtc = new Date();
    todayMidnightUtc.setUTCHours(0, 0, 0, 0);
    const issuanceLimit = limitType && Number.isInteger(limitMax) && limitMax > 0
      ? {
          type: limitType,
          max: limitMax,
          current: limitType === "campaign"
            ? issued
            : coupons.filter((coupon) => {
                const createdAt = new Date(String(coupon.created_at || "")).getTime();
                return Number.isFinite(createdAt) && createdAt >= todayMidnightUtc.getTime();
              }).length,
          stopOnReach: rawIssuanceLimit?.stopOnReach !== false,
        }
      : null;
    const issuanceLimitWithPercent = issuanceLimit
      ? {
          ...issuanceLimit,
          percentUsed: Math.min(100, Math.round((issuanceLimit.current / issuanceLimit.max) * 100)),
          remaining: Math.max(0, issuanceLimit.max - issuanceLimit.current),
        }
      : null;

    // Game session stats
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter((s) => s.completed).length;
    const couponIssuedFromGame = sessions.filter((s) => s.coupon_issued).length;
    const completionRate = totalSessions > 0
      ? Math.round((completedSessions / totalSessions) * 100)
      : 0;
    const gameToConversionRate = completedSessions > 0
      ? Math.round((couponIssuedFromGame / completedSessions) * 100)
      : 0;

    // Funnel
    const funnel = [
      { label: "Game Started", value: totalSessions },
      { label: "Game Completed", value: completedSessions },
      { label: "Coupon Issued", value: couponIssuedFromGame },
      { label: "Coupon Redeemed", value: redeemed },
    ];

    return NextResponse.json({
      filter: {
        mode: dateRange?.mode ?? "latest",
        date: dateRange?.date ?? null,
        startDate: dateRange?.startDate ?? null,
        endDate: dateRange?.endDate ?? null,
      },
      coupons: { issued, redeemed, expired, active, redeemRate, issuanceLimit: issuanceLimitWithPercent },
      game: { totalSessions, completedSessions, completionRate, couponIssuedFromGame, gameToConversionRate },
      funnel,
      charts: {
        issuedByDay: dateRange
          ? buildRangeChartSeries(dateRange.startDate, dateRange.endDate, issueDates)
          : buildChartSeries(14, issueDates),
        redeemedByDay: dateRange
          ? buildRangeChartSeries(dateRange.startDate, dateRange.endDate, redeemDates)
          : buildChartSeries(14, redeemDates),
      },
      recentRedeems: redeemLogsResult.data ?? [],
    });
  } catch (err) {
    console.error("dashboard-stats error", err);
    return NextResponse.json({ error: "An error occurred." }, { status: 500 });
  }
}
