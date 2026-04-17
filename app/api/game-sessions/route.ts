import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../lib/couponData";

type GameSessionBody = {
  sessionId: string;
  mode: string;
  score: number;
  playTimeSec?: number;
  completed?: boolean;
  couponIssued?: boolean;
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

    await supabase.from("game_sessions").insert([
      {
        session_id: sessionId,
        entry_id: body.entryId ? Number(body.entryId) : null,
        nickname_key: body.nicknameKey ? String(body.nicknameKey).toLowerCase().trim() : null,
        mode,
        score,
        play_time_sec: body.playTimeSec ? Number(body.playTimeSec) : null,
        completed: body.completed !== false,
        coupon_issued: body.couponIssued === true,
        coupon_reward_type: body.couponRewardType ? String(body.couponRewardType) : null,
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("game-sessions POST error", err);
    return NextResponse.json({ error: "Failed to record session." }, { status: 500 });
  }
}
