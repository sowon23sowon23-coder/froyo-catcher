import { NextRequest, NextResponse } from "next/server";
import { type CouponState, isCouponExpired } from "../../../../lib/coupons";
import { getServerSupabase } from "../../../../lib/serverSupabase";

function buildInvalidResponse(status = 404) {
  return NextResponse.json({ state: "invalid" satisfies CouponState }, { status });
}

async function loadCoupon(supabase: NonNullable<ReturnType<typeof getServerSupabase>>, token: string) {
  return supabase
    .from("wallet_coupons")
    .select("id,title,description,status,expires_at,redeemed_at")
    .eq("redeem_token", token)
    .maybeSingle();
}

function serializeCouponState(row: {
  id?: number | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  expires_at?: string | null;
  redeemed_at?: string | null;
} | null) {
  if (!row?.id) {
    return { state: "invalid" as const };
  }

  const expiresAt = String(row.expires_at || "");
  const redeemedAt = row.redeemed_at ? String(row.redeemed_at) : null;
  const isExpired = isCouponExpired(expiresAt);
  const isRedeemed = row.status === "redeemed" || Boolean(redeemedAt);
  const state: CouponState = isRedeemed
    ? "already_redeemed"
    : isExpired || row.status === "expired"
      ? "expired"
      : "valid";

  return {
    state,
    coupon: {
      id: Number(row.id),
      title: String(row.title || ""),
      description: String(row.description || ""),
      expiresAt,
      redeemedAt,
    },
  };
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  if (!token) {
    return buildInvalidResponse();
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const result = await loadCoupon(supabase, token);
  if (result.error) {
    return NextResponse.json({ error: result.error.message || "Failed to load coupon." }, { status: 500 });
  }

  return NextResponse.json(serializeCouponState(result.data));
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  if (!token) {
    return buildInvalidResponse();
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  let staffLabel = "staff";
  try {
    const body = (await req.json()) as { staffLabel?: string };
    const nextLabel = String(body.staffLabel || "").trim();
    if (nextLabel) {
      staffLabel = nextLabel.slice(0, 80);
    }
  } catch {
    // Allow empty body for MVP redeem.
  }

  const updated = await supabase
    .from("wallet_coupons")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_by: staffLabel,
    })
    .eq("redeem_token", token)
    .eq("status", "active")
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id,title,description,status,expires_at,redeemed_at")
    .maybeSingle();

  if (updated.error) {
    return NextResponse.json({ error: updated.error.message || "Failed to redeem coupon." }, { status: 500 });
  }

  if (updated.data?.id) {
    return NextResponse.json({
      state: "already_redeemed" satisfies CouponState,
      redeemedNow: true,
      coupon: {
        id: Number(updated.data.id),
        title: String(updated.data.title || ""),
        description: String(updated.data.description || ""),
        expiresAt: String(updated.data.expires_at || ""),
        redeemedAt: updated.data.redeemed_at ? String(updated.data.redeemed_at) : null,
      },
    });
  }

  const existing = await loadCoupon(supabase, token);
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message || "Failed to load coupon." }, { status: 500 });
  }

  const serialized = serializeCouponState(existing.data);
  if (serialized.state === "invalid") {
    return buildInvalidResponse();
  }

  return NextResponse.json({ ...serialized, redeemedNow: false });
}
