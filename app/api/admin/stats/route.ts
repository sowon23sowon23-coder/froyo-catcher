import { NextRequest, NextResponse } from "next/server";

import { buildChartSeries } from "../../../lib/couponMvp";
import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

type WalletCouponRow = {
  id: number;
  redeem_token: string | null;
  status: string | null;
  created_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemed_store_name: string | null;
  redeemed_staff_name: string | null;
};

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

function getWalletStatus(row: Pick<WalletCouponRow, "status" | "expires_at" | "redeemed_at">) {
  if (row.status === "redeemed" || row.redeemed_at) return "used";
  if (row.status === "expired") return "expired";
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "expired";
  return "unused";
}

function formatWalletCode(row: Pick<WalletCouponRow, "id" | "redeem_token">) {
  const token = String(row.redeem_token || "").trim();
  if (token) return token.slice(0, 8).toUpperCase();
  return `WALLET-${row.id}`;
}

function buildRecentLogs(rows: WalletCouponRow[]) {
  return rows
    .filter((row) => getWalletStatus(row) !== "unused")
    .sort((a, b) => {
      const aTime = new Date(String(a.redeemed_at || a.created_at || "")).getTime();
      const bTime = new Date(String(b.redeemed_at || b.created_at || "")).getTime();
      return bTime - aTime;
    })
    .slice(0, 10)
    .map((row) => {
      const status = getWalletStatus(row);
      return {
        id: Number(row.id),
        code: formatWalletCode(row),
        action_type: status === "used" ? "redeemed" : "expired",
        reason: status === "used" ? "Wallet coupon used" : "Wallet coupon expired",
        store_id: row.redeemed_store_name || row.redeemed_by || null,
        staff_id: row.redeemed_staff_name || null,
        order_number: null,
        created_at: String(row.redeemed_at || row.created_at || ""),
      };
    });
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "Admin login is required." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const dateRange = getDateRange(req);
    let walletQuery = supabase
      .from("wallet_coupons")
      .select("id,redeem_token,status,created_at,expires_at,redeemed_at,redeemed_by,redeemed_store_name,redeemed_staff_name")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (dateRange) {
      walletQuery = walletQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
    }

    const walletResult = await walletQuery;

    if (walletResult.error) {
      console.error("Failed to load wallet coupon stats", walletResult.error);
      return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
    }

    const rows = (walletResult.data ?? []) as WalletCouponRow[];
    const totals = { issued: rows.length, used: 0, unused: 0, expired: 0 };
    const storeUsage = new Map<string, number>();
    const issueDates: string[] = [];
    const redeemDates: string[] = [];

    for (const row of rows) {
      const effectiveStatus = getWalletStatus(row);
      if (row.created_at) issueDates.push(String(row.created_at));
      if (effectiveStatus === "used") {
        totals.used += 1;
        if (row.redeemed_at) redeemDates.push(String(row.redeemed_at));
        const storeLabel = String(row.redeemed_store_name || row.redeemed_by || "Wallet Use Button");
        storeUsage.set(storeLabel, (storeUsage.get(storeLabel) || 0) + 1);
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
      recentLogs: buildRecentLogs(rows),
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
