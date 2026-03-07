import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { type CouponGameMode, getCouponExpiryIso, getEligibleCouponReward } from "../../../lib/coupons";
import { requireAuthenticatedEntry } from "../../../lib/serverEntrySession";

type IssueCouponBody = {
  score?: number;
  gameSessionId?: string;
  mode?: CouponGameMode;
};

function normalizeScore(raw: unknown) {
  const score = Number(raw ?? 0);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.floor(score));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedEntry(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: IssueCouponBody;
  try {
    body = (await req.json()) as IssueCouponBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const score = normalizeScore(body.score);
  const gameSessionId = String(body.gameSessionId || "").trim();
  const mode = body.mode;

  if (score === null) {
    return NextResponse.json({ error: "Score must be a non-negative integer." }, { status: 400 });
  }
  if (!isUuid(gameSessionId)) {
    return NextResponse.json({ error: "gameSessionId must be a UUID." }, { status: 400 });
  }
  if (mode && mode !== "free" && mode !== "mission" && mode !== "timeAttack") {
    return NextResponse.json({ error: "Invalid game mode." }, { status: 400 });
  }

  const reward = getEligibleCouponReward(score);
  const { supabase, entry } = auth;

  const existingEvaluation = await supabase
    .from("coupon_reward_evaluations")
    .select("id,entry_id,reward_type")
    .eq("game_session_id", gameSessionId)
    .maybeSingle();

  if (existingEvaluation.error) {
    return NextResponse.json({ error: existingEvaluation.error.message || "Failed to evaluate reward." }, { status: 500 });
  }

  let evaluationId = Number(existingEvaluation.data?.id ?? 0);
  let rewardType = String(existingEvaluation.data?.reward_type || "") || null;

  if (existingEvaluation.data?.entry_id && Number(existingEvaluation.data.entry_id) !== entry.id) {
    return NextResponse.json({ error: "gameSessionId is already tied to another user." }, { status: 409 });
  }

  if (!evaluationId) {
    const created = await supabase
      .from("coupon_reward_evaluations")
      .insert([
        {
          entry_id: entry.id,
          game_session_id: gameSessionId,
          game_mode: mode ?? null,
          score,
          reward_type: reward?.type ?? null,
        },
      ])
      .select("id,reward_type")
      .single();

    if (created.error) {
      if (!isUniqueViolation(created.error as { code?: string })) {
        return NextResponse.json({ error: created.error.message || "Failed to evaluate reward." }, { status: 500 });
      }

      const retried = await supabase
        .from("coupon_reward_evaluations")
        .select("id,entry_id,reward_type")
        .eq("game_session_id", gameSessionId)
        .single();

      if (retried.error) {
        return NextResponse.json({ error: retried.error.message || "Failed to evaluate reward." }, { status: 500 });
      }
      if (Number(retried.data.entry_id) !== entry.id) {
        return NextResponse.json({ error: "gameSessionId is already tied to another user." }, { status: 409 });
      }
      evaluationId = Number(retried.data.id);
      rewardType = String(retried.data.reward_type || "") || null;
    } else {
      evaluationId = Number(created.data.id);
      rewardType = String(created.data.reward_type || "") || null;
    }
  }

  if (!rewardType) {
    return NextResponse.json({ eligible: false, coupon: null });
  }

  const existingCoupon = await supabase
    .from("wallet_coupons")
    .select("id,reward_type,title,description,expires_at,redeem_token,created_at")
    .eq("evaluation_id", evaluationId)
    .maybeSingle();

  if (existingCoupon.error) {
    return NextResponse.json({ error: existingCoupon.error.message || "Failed to load coupon." }, { status: 500 });
  }

  if (existingCoupon.data?.id) {
    return NextResponse.json({
      eligible: true,
      issued: false,
      coupon: {
        id: Number(existingCoupon.data.id),
        rewardType: existingCoupon.data.reward_type,
        title: existingCoupon.data.title,
        description: existingCoupon.data.description,
        expiresAt: existingCoupon.data.expires_at,
        redeemToken: existingCoupon.data.redeem_token,
        createdAt: existingCoupon.data.created_at,
      },
    });
  }

  const rewardDef = getEligibleCouponReward(score);
  if (!rewardDef) {
    return NextResponse.json({ eligible: false, coupon: null });
  }

  const inserted = await supabase
    .from("wallet_coupons")
    .insert([
      {
        evaluation_id: evaluationId,
        entry_id: entry.id,
        game_session_id: gameSessionId,
        reward_type: rewardDef.type,
        title: rewardDef.title,
        description: rewardDef.description,
        expires_at: getCouponExpiryIso(),
        redeem_token: randomBytes(24).toString("base64url"),
      },
    ])
    .select("id,reward_type,title,description,expires_at,redeem_token,created_at")
    .single();

  if (inserted.error) {
    if (!isUniqueViolation(inserted.error as { code?: string })) {
      return NextResponse.json({ error: inserted.error.message || "Failed to issue coupon." }, { status: 500 });
    }

    const retried = await supabase
      .from("wallet_coupons")
      .select("id,reward_type,title,description,expires_at,redeem_token,created_at")
      .eq("evaluation_id", evaluationId)
      .single();

    if (retried.error) {
      return NextResponse.json({ error: retried.error.message || "Failed to load coupon." }, { status: 500 });
    }

    return NextResponse.json({
      eligible: true,
      issued: false,
      coupon: {
        id: Number(retried.data.id),
        rewardType: retried.data.reward_type,
        title: retried.data.title,
        description: retried.data.description,
        expiresAt: retried.data.expires_at,
        redeemToken: retried.data.redeem_token,
        createdAt: retried.data.created_at,
      },
    });
  }

  return NextResponse.json({
    eligible: true,
    issued: true,
    coupon: {
      id: Number(inserted.data.id),
      rewardType: inserted.data.reward_type,
      title: inserted.data.title,
      description: inserted.data.description,
      expiresAt: inserted.data.expires_at,
      redeemToken: inserted.data.redeem_token,
      createdAt: inserted.data.created_at,
    },
  });
}
