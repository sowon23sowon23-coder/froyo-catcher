import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  const supabase = getServiceSupabaseOrThrow();
  const feedbackTable = (process.env.FEEDBACK_TABLE || "user_feedback").trim();

  const attempts = [
    () =>
      supabase
        .from(feedbackTable)
        .select("id,message,nickname,store,source,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    () =>
      supabase
        .from(feedbackTable)
        .select("id,message,nickname,store,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    () =>
      supabase
        .from(feedbackTable)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    () => supabase.from(feedbackTable).select("*").limit(200),
  ];

  let rows: any[] | null = null;
  let error: { message?: string } | null = null;
  for (const attempt of attempts) {
    const result = await attempt();
    if (!result.error) {
      rows = (result.data as any[] | null) ?? [];
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
    { rows: rows ?? [], table: feedbackTable },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
  );
}
