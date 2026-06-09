import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";
import { getGameDayKey, getGameTimeParts, gameWallTimeToUtc } from "../../../lib/dallasTime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  try {
    const supabase = getServiceSupabaseOrThrow();
    const todayParts = getGameTimeParts(new Date());

    const todayStart = gameWallTimeToUtc(todayParts.year, todayParts.month, todayParts.day);
    const sevenDaysAgo = gameWallTimeToUtc(todayParts.year, todayParts.month, todayParts.day - 6);
    const fourteenDaysAgo = gameWallTimeToUtc(todayParts.year, todayParts.month, todayParts.day - 13);
    const ninetyDaysAgo = gameWallTimeToUtc(todayParts.year, todayParts.month, todayParts.day - 89);

    const dayKeys: string[] = [];
    for (let i = 13; i >= 0; i--) {
      dayKeys.push(getGameDayKey(gameWallTimeToUtc(todayParts.year, todayParts.month, todayParts.day - i)));
    }

    const [sessionsResult, couponsResult, redeemLogsResult] = await Promise.all([
      supabase
        .from("game_sessions")
        .select("nickname_key,created_at")
        .not("nickname_key", "is", null)
        .gte("created_at", ninetyDaysAgo.toISOString())
        .order("created_at", { ascending: true })
        .limit(50000),
      supabase
        .from("wallet_coupons")
        .select("reward_type,title,status,created_at,redeemed_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("redeem_logs")
        .select("store_id,action_type")
        .eq("action_type", "redeem_success")
        .limit(5000),
    ]);

    const sessions = sessionsResult.data ?? [];
    const coupons = couponsResult.data ?? [];
    const redeemLogs = redeemLogsResult.data ?? [];

    // ── 1. Unique Players ────────────────────────────────────────────────────
    const windowStartMs = fourteenDaysAgo.getTime();
    const todayStartMs = todayStart.getTime();
    const sevenDaysAgoMs = sevenDaysAgo.getTime();

    const uniqueLast14 = new Set<string>();
    const uniqueToday = new Set<string>();
    const uniqueLast7 = new Set<string>();
    const playersByDay = new Map<string, Set<string>>();

    for (const s of sessions) {
      const key = String(s.nickname_key ?? "");
      if (!key) continue;
      const t = new Date(String(s.created_at)).getTime();
      if (Number.isNaN(t)) continue;

      if (t >= windowStartMs) {
        uniqueLast14.add(key);
        const dk = getGameDayKey(new Date(t));
        if (!playersByDay.has(dk)) playersByDay.set(dk, new Set());
        playersByDay.get(dk)!.add(key);
      }
      if (t >= todayStartMs) uniqueToday.add(key);
      if (t >= sevenDaysAgoMs) uniqueLast7.add(key);
    }

    const dauByDay = dayKeys.map((date) => ({
      date,
      count: playersByDay.get(date)?.size ?? 0,
    }));

    // ── 2. New vs Returning Players (14-day window) ──────────────────────────
    // First session date per player within 90-day data window
    const firstSessionByPlayer = new Map<string, string>();
    for (const s of sessions) {
      const key = String(s.nickname_key ?? "");
      if (!key) continue;
      if (!firstSessionByPlayer.has(key)) {
        firstSessionByPlayer.set(key, getGameDayKey(new Date(String(s.created_at))));
      }
    }

    const newVsReturning = dayKeys.map((dayKey) => {
      const playersOnDay = Array.from(playersByDay.get(dayKey) ?? []);
      let newCount = 0;
      let returningCount = 0;
      for (const player of playersOnDay) {
        if (firstSessionByPlayer.get(player) === dayKey) newCount++;
        else returningCount++;
      }
      return { date: dayKey, newPlayers: newCount, returningPlayers: returningCount };
    });

    // ── 3. Coupon Performance by Reward Type ─────────────────────────────────
    const byType = new Map<string, { label: string; issued: number; redeemed: number }>();
    const nowMs = Date.now();
    for (const c of coupons) {
      const type = String(c.reward_type ?? "unknown");
      const label = String(c.title ?? type);
      if (!byType.has(type)) byType.set(type, { label, issued: 0, redeemed: 0 });
      const entry = byType.get(type)!;
      entry.issued++;
      if (c.redeemed_at || c.status === "used") entry.redeemed++;
    }
    const couponByRewardType = Array.from(byType.entries())
      .map(([rewardType, { label, issued, redeemed }]) => ({
        rewardType,
        label,
        issued,
        redeemed,
        redemptionRate: issued > 0 ? Math.round((redeemed / issued) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.issued - a.issued);

    // ── 4. Time to Redemption ────────────────────────────────────────────────
    const redemptionHours: number[] = [];
    for (const c of coupons) {
      if (!c.redeemed_at || !c.created_at) continue;
      const issued = new Date(String(c.created_at)).getTime();
      const redeemed = new Date(String(c.redeemed_at)).getTime();
      if (!Number.isFinite(issued) || !Number.isFinite(redeemed) || redeemed < issued) continue;
      redemptionHours.push((redeemed - issued) / (1000 * 60 * 60));
    }

    const avgHours = redemptionHours.length > 0
      ? redemptionHours.reduce((a, b) => a + b, 0) / redemptionHours.length
      : null;
    const avgDays = avgHours !== null ? Math.round(avgHours / 24 * 10) / 10 : null;
    const avgHoursRounded = avgHours !== null ? Math.round(avgHours * 10) / 10 : null;

    let within24 = 0, oneTo3days = 0, fourTo7days = 0, over7days = 0;
    for (const h of redemptionHours) {
      const d = h / 24;
      if (d <= 1) within24++;
      else if (d <= 3) oneTo3days++;
      else if (d <= 7) fourTo7days++;
      else over7days++;
    }
    const timeToRedemption = {
      avgDays,
      avgHours: avgHoursRounded,
      totalRedeemed: redemptionHours.length,
      distribution: [
        { label: "Within 24h", count: within24 },
        { label: "1–3 days", count: oneTo3days },
        { label: "4–7 days", count: fourTo7days },
        { label: "7+ days", count: over7days },
      ],
    };

    // ── 5. Coupon Status Breakdown ───────────────────────────────────────────
    let csIssued = 0, csRedeemed = 0, csExpired = 0, csActive = 0;
    const nowDate = new Date();
    for (const c of coupons) {
      csIssued++;
      if (c.redeemed_at || c.status === "used") csRedeemed++;
      else if (c.status === "expired" || (c.expires_at && new Date(String(c.expires_at)) < nowDate)) csExpired++;
      else csActive++;
    }

    // ── 6. Store-Level Redemption ────────────────────────────────────────────
    const storeCounts = new Map<string, number>();
    for (const log of redeemLogs) {
      const store = String(log.store_id ?? "Unknown");
      storeCounts.set(store, (storeCounts.get(store) ?? 0) + 1);
    }
    const storeRedemption = Array.from(storeCounts.entries())
      .map(([storeId, count]) => ({ storeId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      uniquePlayers: {
        last14Days: uniqueLast14.size,
        dau: uniqueToday.size,
        wau: uniqueLast7.size,
        byDay: dauByDay,
      },
      newVsReturning,
      couponByRewardType,
      timeToRedemption,
      couponStatusBreakdown: { issued: csIssued, redeemed: csRedeemed, expired: csExpired, active: csActive },
      storeRedemption,
    });
  } catch (err) {
    console.error("engagement-stats error", err);
    return NextResponse.json({ error: "An error occurred." }, { status: 500 });
  }
}
