import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

const LIVES_ICON_KEY = "game_lives_icon";

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const supabase = getServiceSupabaseOrThrow();
    const result = await supabase
      .from("coupon_config")
      .select("value")
      .eq("key", LIVES_ICON_KEY)
      .maybeSingle();

    const value = (result.data?.value as { type: string; value: string } | null) ?? null;
    return NextResponse.json({ icon: value });
  } catch {
    return NextResponse.json({ error: "Failed to load lives icon." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const body = (await req.json()) as { icon: { type: string; value: string } | null };
    const supabase = getServiceSupabaseOrThrow();
    const { error } = await supabase
      .from("coupon_config")
      .upsert({ key: LIVES_ICON_KEY, value: body.icon ?? null }, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ ok: true, icon: body.icon });
  } catch (err) {
    console.error("lives-icon PUT error", err);
    return NextResponse.json({ error: "Failed to save lives icon." }, { status: 500 });
  }
}
