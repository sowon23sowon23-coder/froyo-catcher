import { NextRequest, NextResponse } from "next/server";
import { getCouponState, getWalletCouponStatus, type CouponState } from "../../../../lib/coupons";
import { getServerSupabase } from "../../../../lib/serverSupabase";
import { requirePortalRole } from "../../../../lib/portalAuth";

function buildInvalidResponse(status = 404) {
  return NextResponse.json({ state: "invalid" satisfies CouponState }, { status });
}

async function loadCoupon(supabase: NonNullable<ReturnType<typeof getServerSupabase>>, token: string) {
  return supabase
    .from("wallet_coupons")
    .select("id,title,description,status,expires_at,redeemed_at,redeemed_staff_name,redeemed_store_name")
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
  redeemed_staff_name?: string | null;
  redeemed_store_name?: string | null;
} | null) {
  if (!row?.id) {
    return { state: "invalid" as const };
  }

  const expiresAt = String(row.expires_at || "");
  const redeemedAt = row.redeemed_at ? String(row.redeemed_at) : null;
  const state = getCouponState({
    status: row.status,
    expiresAt,
    redeemedAt,
  });

  return {
    state,
    coupon: {
      id: Number(row.id),
      title: String(row.title || ""),
      description: String(row.description || ""),
      status: getWalletCouponStatus({
        status: row.status,
        expiresAt,
        redeemedAt,
      }),
      expiresAt,
      redeemedAt,
      redeemedStaffName: row.redeemed_staff_name ? String(row.redeemed_staff_name) : null,
      redeemedStoreName: row.redeemed_store_name ? String(row.redeemed_store_name) : null,
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
  const portalSession = requirePortalRole(req, ["staff", "admin"]);
  if (!portalSession) {
    return NextResponse.json({ error: "Staff login required." }, { status: 401 });
  }

  const token = String(params.token || "").trim();
  if (!token) {
    return buildInvalidResponse();
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  let staffName = "";
  let storeName = "";
  try {
    const body = (await req.json()) as { staffName?: string; storeName?: string };
    staffName = String(body.staffName || "").trim().slice(0, 80);
    storeName = String(body.storeName || "").trim().slice(0, 120);
  } catch {
    return NextResponse.json({ error: "Store name and staff name are required." }, { status: 400 });
  }

  if (!staffName || !storeName) {
    return NextResponse.json({ error: "Store name and staff name are required." }, { status: 400 });
  }

  const updated = await supabase
    .from("wallet_coupons")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_by: `${storeName} / ${staffName}`,
      redeemed_staff_name: staffName,
      redeemed_store_name: storeName,
    })
    .eq("redeem_token", token)
    .eq("status", "active")
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id,title,description,status,expires_at,redeemed_at,redeemed_staff_name,redeemed_store_name")
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
        status: "redeemed",
        expiresAt: String(updated.data.expires_at || ""),
        redeemedAt: updated.data.redeemed_at ? String(updated.data.redeemed_at) : null,
        redeemedStaffName: updated.data.redeemed_staff_name ? String(updated.data.redeemed_staff_name) : null,
        redeemedStoreName: updated.data.redeemed_store_name ? String(updated.data.redeemed_store_name) : null,
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
