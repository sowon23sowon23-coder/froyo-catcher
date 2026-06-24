import { NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../lib/couponData";

export const dynamic = "force-dynamic";

const ACTIVE_BG_KEY = "game_bg_url";

export async function GET() {
  try {
    const supabase = getServiceSupabaseOrThrow();
    const result = await supabase
      .from("coupon_config")
      .select("value")
      .eq("key", ACTIVE_BG_KEY)
      .maybeSingle();

    const url = (result.data?.value as string | null) ?? null;
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: null });
  }
}
