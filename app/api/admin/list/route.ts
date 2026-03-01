import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!adminToken || !serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token !== adminToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const store = (req.nextUrl.searchParams.get("store") || "").trim();

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const buildQuery = (selectColumns: string, withScoreOrder: boolean) => {
    let query = adminSupabase
      .from("leaderboard_best_v2")
      .select(selectColumns)
      .limit(5000);

    if (withScoreOrder) {
      query = query.order("score", { ascending: false }).order("updated_at", { ascending: true });
    }

    return query;
  };

  const attempts = [
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at,character,store", true), hasStore: true },
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at,store", true), hasStore: true },
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at,character", true), hasStore: false },
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at", true), hasStore: false },
    { run: () => buildQuery("nickname_key,nickname_display,score,store,character", false), hasStore: true },
    { run: () => buildQuery("nickname_key,nickname_display,score", false), hasStore: false },
    { run: () => buildQuery("*", false), hasStore: false },
  ];

  let data: any[] | null = null;
  let error: { message?: string } | null = null;
  let supportsStore = false;

  for (const attempt of attempts) {
    const result = await attempt.run();
    if (!result.error) {
      data = (result.data as any[] | null) ?? [];
      error = null;
      supportsStore = attempt.hasStore;
      break;
    }
    error = result.error as { message?: string };
  }

  if (error) {
    return NextResponse.json({ error: "Failed to load leaderboard records.", details: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ store?: string | null }>;
  if (supportsStore && store && store !== "__ALL__") {
    const wanted = store.trim().toLowerCase();
    const filtered = rows.filter((r) => ((r.store ?? "").trim().toLowerCase() === wanted));
    return NextResponse.json(
      { rows: filtered, supportsStore },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }

  return NextResponse.json(
    { rows, supportsStore },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
