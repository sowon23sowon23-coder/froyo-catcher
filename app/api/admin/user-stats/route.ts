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

    const [totalUsersResult, entriesCreatedResult, sessionsResult] = await Promise.all([
      supabase.from("entries").select("id", { count: "exact", head: true }),
      supabase
        .from("entries")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("game_sessions")
        .select("nickname_key,completed,created_at")
        .not("nickname_key", "is", null)
        .limit(20000),
    ]);

    if (totalUsersResult.error || sessionsResult.error) {
      return NextResponse.json({ error: "Failed to load user stats." }, { status: 500 });
    }

    const totalUsers = totalUsersResult.count ?? 0;
    const sessions = sessionsResult.data ?? [];

    // Sessions per user
    const sessionCountByUser = new Map<string, number>();
    for (const s of sessions) {
      const key = String(s.nickname_key ?? "");
      if (!key) continue;
      sessionCountByUser.set(key, (sessionCountByUser.get(key) ?? 0) + 1);
    }

    const usersWhoPlayed = sessionCountByUser.size;
    const neverPlayed = Math.max(0, totalUsers - usersWhoPlayed);

    const sessionCounts = Array.from(sessionCountByUser.values());
    const totalSessionsLinked = sessionCounts.reduce((a, b) => a + b, 0);
    const avgSessionsPerUser = usersWhoPlayed > 0
      ? Math.round((totalSessionsLinked / usersWhoPlayed) * 10) / 10
      : 0;

    const returningUsers = sessionCounts.filter((n) => n >= 2).length;
    const returningRate = usersWhoPlayed > 0
      ? Math.round((returningUsers / usersWhoPlayed) * 100)
      : 0;

    // Play count distribution
    let once = 0, twoToThree = 0, fourToNine = 0, tenPlus = 0;
    for (const n of sessionCounts) {
      if (n === 1) once++;
      else if (n <= 3) twoToThree++;
      else if (n <= 9) fourToNine++;
      else tenPlus++;
    }
    const playCountDistribution = [
      { label: "1 time", count: once },
      { label: "2–3 times", count: twoToThree },
      { label: "4–9 times", count: fourToNine },
      { label: "10+ times", count: tenPlus },
    ];

    // New users by day (last 14 days)
    const todayParts = getGameTimeParts(new Date());
    const dayKeys: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = gameWallTimeToUtc(todayParts.year, todayParts.month, todayParts.day - i);
      dayKeys.push(getGameDayKey(d));
    }
    const newUserDayCounts = new Map<string, number>(dayKeys.map((k) => [k, 0]));
    for (const row of entriesCreatedResult.data ?? []) {
      const key = getGameDayKey(new Date(String(row.created_at)));
      if (newUserDayCounts.has(key)) {
        newUserDayCounts.set(key, (newUserDayCounts.get(key) ?? 0) + 1);
      }
    }
    const newUsersByDay = dayKeys.map((date) => ({ date, count: newUserDayCounts.get(date) ?? 0 }));

    return NextResponse.json({
      totalUsers,
      usersWhoPlayed,
      neverPlayed,
      avgSessionsPerUser,
      returningUsers,
      returningRate,
      playCountDistribution,
      newUsersByDay,
    });
  } catch (err) {
    console.error("user-stats error", err);
    return NextResponse.json({ error: "An error occurred." }, { status: 500 });
  }
}
