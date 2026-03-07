import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedEntry } from "../../../lib/serverEntrySession";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedEntry(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, entry } = auth;
  const nowIso = new Date().toISOString();

  const rows = await supabase
    .from("wallet_coupons")
    .select("id,reward_type,title,description,expires_at,redeem_token,created_at")
    .eq("entry_id", entry.id)
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (rows.error) {
    return NextResponse.json({ error: rows.error.message || "Failed to load wallet." }, { status: 500 });
  }

  return NextResponse.json({
    nickname: entry.nickname,
    coupons: (rows.data ?? []).map((row) => ({
      id: Number(row.id),
      rewardType: row.reward_type,
      title: row.title,
      description: row.description,
      expiresAt: row.expires_at,
      redeemToken: row.redeem_token,
      createdAt: row.created_at,
    })),
  });
}
