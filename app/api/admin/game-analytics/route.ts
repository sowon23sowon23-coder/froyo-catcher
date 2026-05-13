import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
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
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  try {
    const supabase = getServiceSupabaseOrThrow();
    const dateRange = getDateRange(req);

    let sessionsQuery = supabase
      .from("game_sessions")
      .select("score,mode,play_time_sec,coupon_issued,coupon_reward_type,completed,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    let recentQuery = supabase
      .from("game_sessions")
      .select("score,mode,nickname_key,coupon_issued,coupon_reward_type,created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (dateRange) {
      sessionsQuery = sessionsQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
      recentQuery = recentQuery.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
    }

    const [sessionsResult, recentResult] = await Promise.all([sessionsQuery, recentQuery]);

    if (sessionsResult.error) {
      return NextResponse.json({ error: "Failed to load game analytics." }, { status: 500 });
    }

    const rows = sessionsResult.data ?? [];
    const totalSessions = rows.length;

    if (totalSessions === 0) {
      return NextResponse.json({
        filter: {
          mode: dateRange?.mode ?? "latest",
          date: dateRange?.date ?? null,
          startDate: dateRange?.startDate ?? null,
          endDate: dateRange?.endDate ?? null,
        },
        totalSessions: 0,
        avgScore: 0,
        avgPlayTimeSec: null,
        couponIssuedCount: 0,
        couponIssuedRate: 0,
        scoreDistribution: [],
        scoreByMode: [],
        sessionsByDay: [],
        recentSessions: recentResult.data ?? [],
      });
    }

    // Score stats
    const scores = rows.map((r) => Number(r.score));
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / totalSessions);

    // Play time
    const playTimes = rows.filter((r) => r.play_time_sec != null).map((r) => Number(r.play_time_sec));
    const avgPlayTimeSec = playTimes.length > 0
      ? Math.round(playTimes.reduce((a, b) => a + b, 0) / playTimes.length)
      : null;

    // Coupon stats
    const couponIssuedCount = rows.filter((r) => r.coupon_issued).length;
    const couponIssuedRate = Math.round((couponIssuedCount / totalSessions) * 100);

    // Score distribution in buckets of 10
    const buckets = new Map<number, number>();
    for (const score of scores) {
      const bucket = Math.floor(score / 10) * 10;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    const scoreDistribution = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucket, count]) => ({ range: `${bucket}-${bucket + 9}`, count }));

    // Avg score by mode
    const byMode = new Map<string, number[]>();
    for (const row of rows) {
      const m = String(row.mode || "free");
      if (!byMode.has(m)) byMode.set(m, []);
      byMode.get(m)!.push(Number(row.score));
    }
    const scoreByMode = Array.from(byMode.entries()).map(([mode, modeScores]) => ({
      mode,
      avgScore: Math.round(modeScores.reduce((a, b) => a + b, 0) / modeScores.length),
      count: modeScores.length,
    }));

    // Sessions by day
    const dayCounts = new Map<string, number>();
    let sessionsByDay: Array<{ date: string; count: number }>;
    if (dateRange) {
      sessionsByDay = buildRangeChartSeries(dateRange.startDate, dateRange.endDate, rows.map((row) => String(row.created_at)));
    } else {
      const now = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dayCounts.set(d.toISOString().slice(0, 10), 0);
      }
      for (const row of rows) {
        const day = String(row.created_at).slice(0, 10);
        if (dayCounts.has(day)) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
      sessionsByDay = Array.from(dayCounts.entries()).map(([date, count]) => ({ date, count }));
    }

    return NextResponse.json({
      filter: {
        mode: dateRange?.mode ?? "latest",
        date: dateRange?.date ?? null,
        startDate: dateRange?.startDate ?? null,
        endDate: dateRange?.endDate ?? null,
      },
      totalSessions,
      avgScore,
      avgPlayTimeSec,
      couponIssuedCount,
      couponIssuedRate,
      scoreDistribution,
      scoreByMode,
      sessionsByDay,
      recentSessions: recentResult.data ?? [],
    });
  } catch (err) {
    console.error("game-analytics error", err);
    return NextResponse.json({ error: "An error occurred." }, { status: 500 });
  }
}
