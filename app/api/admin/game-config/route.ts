import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import {
  GAME_ACCESS_CONFIG_KEY,
  normalizeGameAccessConfig,
  resolveGameAccessState,
  type GameAccessConfig,
} from "../../../lib/gameAccess";
import { requirePortalRole } from "../../../lib/portalAuth";

export const dynamic = "force-dynamic";

async function loadGameAccessConfig() {
  const supabase = getServiceSupabaseOrThrow();
  const result = await supabase
    .from("coupon_config")
    .select("value")
    .eq("key", GAME_ACCESS_CONFIG_KEY)
    .maybeSingle();

  if (result.error) {
    console.error("Game access config lookup failed", result.error);
    throw new Error("Failed to load game settings.");
  }

  return normalizeGameAccessConfig(result.data?.value);
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  try {
    const config = await loadGameAccessConfig();
    return NextResponse.json({ config, state: resolveGameAccessState(config) });
  } catch {
    return NextResponse.json({ error: "Failed to load game settings." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) return NextResponse.json({ error: "Admin login is required." }, { status: 401 });

  let body: { game_access?: GameAccessConfig };
  try {
    body = (await req.json()) as { game_access?: GameAccessConfig };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const config = normalizeGameAccessConfig(body.game_access);
  const state = resolveGameAccessState(config);

  if (config.mode === "scheduled" && state.startsAt && state.endsAt && state.startsAt >= state.endsAt) {
    return NextResponse.json({ error: "Game start time must be before the end time." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const result = await supabase
      .from("coupon_config")
      .upsert({ key: GAME_ACCESS_CONFIG_KEY, value: config }, { onConflict: "key" })
      .select("key,value");

    if (result.error || !result.data?.length) {
      console.error("Game access config save failed", result.error);
      return NextResponse.json({ error: "Failed to save game settings." }, { status: 500 });
    }

    return NextResponse.json({ config, state: resolveGameAccessState(config) });
  } catch (error) {
    console.error("Admin game-config PUT route error", error);
    return NextResponse.json({ error: "Failed to save game settings." }, { status: 500 });
  }
}
