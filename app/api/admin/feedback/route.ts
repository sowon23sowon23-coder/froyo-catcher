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

  const feedbackTable = (process.env.FEEDBACK_TABLE || "user_feedback").trim();

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const attempts = [
    () =>
      adminSupabase
        .from(feedbackTable)
        .select("id,message,nickname,store,source,user_agent,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    () =>
      adminSupabase
        .from(feedbackTable)
        .select("id,message,nickname,store,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    () =>
      adminSupabase
        .from(feedbackTable)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    () => adminSupabase.from(feedbackTable).select("*").limit(500),
  ];

  let data: any[] | null = null;
  let error: { message?: string } | null = null;

  for (const attempt of attempts) {
    const result = await attempt();
    if (!result.error) {
      data = (result.data as any[] | null) ?? [];
      error = null;
      break;
    }
    error = result.error as { message?: string };
  }

  if (error) {
    return NextResponse.json(
      { error: "Failed to load feedback.", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { rows: data ?? [], table: feedbackTable },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
  );
}
