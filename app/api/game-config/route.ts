import { NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../lib/couponData";
import { GAME_ACCESS_CONFIG_KEY, normalizeGameAccessConfig, resolveGameAccessState } from "../../lib/gameAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceSupabaseOrThrow();
    const result = await supabase
      .from("coupon_config")
      .select("value")
      .eq("key", GAME_ACCESS_CONFIG_KEY)
      .maybeSingle();

    if (result.error) {
      console.error("Public game config lookup failed", result.error);
      return NextResponse.json({ state: resolveGameAccessState(null) });
    }

    return NextResponse.json({ state: resolveGameAccessState(normalizeGameAccessConfig(result.data?.value)) });
  } catch (error) {
    console.error("Public game-config route error", error);
    return NextResponse.json({ state: resolveGameAccessState(null) });
  }
}
