import { NextRequest, NextResponse } from "next/server";

import { buildChartSeries, getCouponStatus } from "../../../lib/couponMvp";
import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

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
  const end = new Date(`${rangeEnd}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
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
  if (!session) {
    return NextResponse.json({ error: "Admin login is required." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const dateRange = getDateRange(req);
    let couponsQuery = supabase
      .from("coupons")
      .select("id,code,status,issued_at,expires_at,redeemed_at,redeemed_store_id")
      .order("created_at", { ascending: false })
      .limit(2000);
    let recentLogsQuery = supabase
      .from("redeem_logs")
      .select("id,code,action_type,reason,store_id,staff_id,order_number,created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (dateRange) {
      couponsQuery = couponsQuery.gte("issued_at", dateRange.startIso).lt("issued_at", dateRange.endIso);
      recentLogsQuery = recentLogsQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
    }

    const [couponsResult, recentLogsResult] = await Promise.all([
      couponsQuery,
      recentLogsQuery,
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
      filter: {
        mode: dateRange?.mode ?? "latest",
        date: dateRange?.date ?? null,
        startDate: dateRange?.startDate ?? null,
        endDate: dateRange?.endDate ?? null,
      },
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
        issuedByDay: dateRange
          ? buildRangeChartSeries(dateRange.startDate, dateRange.endDate, issueDates)
          : buildChartSeries(14, issueDates),
        redeemedByDay: dateRange
          ? buildRangeChartSeries(dateRange.startDate, dateRange.endDate, redeemDates)
          : buildChartSeries(14, redeemDates),
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
