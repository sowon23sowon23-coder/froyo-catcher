import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login required." }, { status: 401 });

  const nickname = req.nextUrl.searchParams.get("nickname")?.trim().toLowerCase() ?? "";
  if (nickname.length < 2) {
    return NextResponse.json({ error: "Nickname must be at least 2 characters." }, { status: 400 });
  }

  const supabase = getServiceSupabaseOrThrow();

  const entriesResult = await supabase
    .from("entries")
    .select("id,nickname_display,nickname_key,contact_type,contact_value,created_at")
    .ilike("nickname_key", `%${nickname}%`)
    .limit(10);

  if (entriesResult.error) {
    return NextResponse.json({ error: "Failed to search users." }, { status: 500 });
  }

  const entries = entriesResult.data ?? [];

  const results = await Promise.all(
    entries.map(async (entry) => {
      const walletsResult = await supabase
        .from("wallet_coupons")
        .select("id,title,reward_type,status,expires_at,created_at,redeemed_at")
        .eq("entry_id", entry.id)
        .order("created_at", { ascending: false });

      return {
        ...entry,
        walletCoupons: walletsResult.data ?? [],
      };
    }),
  );

  return NextResponse.json({ entries: results });
}
