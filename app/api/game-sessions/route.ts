import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../lib/couponData";
import { getGameAccessStateForServer } from "../../lib/gameAccessServer";

type GameSessionBody = {
  sessionId: string;
  mode: string;
  score: number;
  playTimeSec?: number;
  completed?: boolean;
  couponIssued?: boolean;
  couponUpgraded?: boolean;
  couponRewardType?: string;
  nicknameKey?: string;
  entryId?: number;
};

export async function POST(req: NextRequest) {
  let body: GameSessionBody;
  try {
    body = (await req.json()) as GameSessionBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sessionId = String(body.sessionId || "").trim();
  const mode = String(body.mode || "free").trim();
  const score = Number(body.score ?? 0);

  if (!sessionId || !["free", "mission", "timeAttack"].includes(mode) || !Number.isFinite(score)) {
    return NextResponse.json({ error: "Invalid session data." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const gameAccess = await getGameAccessStateForServer(supabase);
    if (!gameAccess.isOpen) {
      return NextResponse.json({ error: "game_closed", message: gameAccess.message }, { status: 403 });
    }

    const row = {
      session_id: sessionId,
      entry_id: body.entryId ? Number(body.entryId) : null,
      nickname_key: body.nicknameKey ? String(body.nicknameKey).toLowerCase().trim() : null,
      mode,
      score,
      play_time_sec: body.playTimeSec ? Number(body.playTimeSec) : null,
      completed: body.completed !== false,
      coupon_issued: body.couponIssued === true,
      coupon_reward_type: body.couponRewardType ? String(body.couponRewardType) : null,
    };
    const rowWithUpgrade = {
      ...row,
      coupon_upgraded: body.couponUpgraded === true,
    };

    const insertSession = async (includeCouponUpgrade: boolean) =>
      supabase.from("game_sessions").insert([includeCouponUpgrade ? rowWithUpgrade : row]);

    const updateSession = async (includeCouponUpgrade: boolean) =>
      supabase
        .from("game_sessions")
        .update(includeCouponUpgrade ? rowWithUpgrade : row)
        .eq("session_id", sessionId)
        .select("id")
        .limit(1);

    if (body.completed !== false) {
      const updated = await updateSession(true);
      if (updated.error) {
        const message = String(updated.error.message || "");
        const missingCouponUpgradedColumn = message.includes("coupon_upgraded");
        if (!missingCouponUpgradedColumn) {
          console.error("game_sessions update failed", updated.error);
          return NextResponse.json({ error: "Failed to record session." }, { status: 500 });
        }

        const fallbackUpdated = await updateSession(false);
        if (fallbackUpdated.error) {
          console.error("game_sessions fallback update failed", fallbackUpdated.error);
          return NextResponse.json({ error: "Failed to record session." }, { status: 500 });
        }
        if ((fallbackUpdated.data ?? []).length > 0) {
          return NextResponse.json({ ok: true });
        }
      } else if ((updated.data ?? []).length > 0) {
        return NextResponse.json({ ok: true });
      }
    }

    const inserted = await insertSession(true);

    if (inserted.error) {
      const message = String(inserted.error.message || "");
      const missingCouponUpgradedColumn = message.includes("coupon_upgraded");
      if (!missingCouponUpgradedColumn) {
        console.error("game_sessions insert failed", inserted.error);
        return NextResponse.json({ error: "Failed to record session." }, { status: 500 });
      }

      const fallbackInserted = await insertSession(false);
      if (fallbackInserted.error) {
        console.error("game_sessions fallback insert failed", fallbackInserted.error);
        return NextResponse.json({ error: "Failed to record session." }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("game-sessions POST error", err);
    return NextResponse.json({ error: "Failed to record session." }, { status: 500 });
  }
}
