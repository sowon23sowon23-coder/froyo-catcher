import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  const supabase = getServiceSupabaseOrThrow();
  const feedbackTable = (process.env.FEEDBACK_TABLE || "user_feedback").trim();

  const result = await supabase
    .from(feedbackTable)
    .select("id,message,nickname,store,source,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (result.error) {
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }

  return NextResponse.json({ rows: result.data ?? [] });
}
