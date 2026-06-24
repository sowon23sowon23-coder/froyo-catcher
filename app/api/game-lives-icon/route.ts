import { NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../lib/couponData";

export const dynamic = "force-dynamic";

const LIVES_ICON_KEY = "game_lives_icon";

export async function GET() {
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
    return NextResponse.json({ icon: null });
  }
}
