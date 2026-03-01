import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type DeleteBody = {
  nicknameKey?: string;
};

export async function POST(req: NextRequest) {
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

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nicknameKey = (body.nicknameKey || "").trim().toLowerCase();
  if (!nicknameKey) {
    return NextResponse.json({ error: "nicknameKey is required." }, { status: 400 });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error, count } = await adminSupabase
    .from("leaderboard_best_v2")
    .delete({ count: "exact" })
    .eq("nickname_key", nicknameKey);

  if (error) {
    return NextResponse.json({ error: "Delete failed.", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}

