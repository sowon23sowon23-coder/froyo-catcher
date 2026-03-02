import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LeaderboardRow = {
  nickname_key: string;
  nickname_display: string;
  score: number;
  updated_at: string;
  character?: "green" | "berry" | "sprinkle";
  store?: string | null;
};

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const mode = (req.nextUrl.searchParams.get("mode") || "today").trim();
  const store = (req.nextUrl.searchParams.get("store") || "__ALL__").trim();
  const todayFrom = (req.nextUrl.searchParams.get("todayFrom") || "").trim();

  let query = supabase
    .from("leaderboard_best_v2")
    .select("nickname_key,nickname_display,score,updated_at,character,store")
    .order("score", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(20);

  if (store && store !== "__ALL__") {
    query = query.eq("store", store);
  }

  if (mode === "today" && todayFrom) {
    query = query.gte("updated_at", todayFrom);
  }

  const board = await query;
  if (board.error) {
    return NextResponse.json({ error: board.error.message || "Failed to load leaderboard." }, { status: 500 });
  }

  const list = (board.data as LeaderboardRow[] | null) ?? [];
  return NextResponse.json(
    { rows: list },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
