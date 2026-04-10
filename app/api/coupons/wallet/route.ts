import { NextRequest, NextResponse } from "next/server";
import { getCouponState, getWalletCouponStatus, resolveCouponReward } from "../../../lib/coupons";
import { type EntryContactType, normalizeEmail, normalizeUsPhone } from "../../../lib/entry";
import { getServerSupabase } from "../../../lib/serverSupabase";
import { requireAuthenticatedEntry } from "../../../lib/serverEntrySession";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedEntry(req);
  let supabase: any;
  let entry: { id: number; nickname: string };

  if (auth.ok) {
    supabase = auth.supabase;
    entry = auth.entry;
  } else {
    const nickname = String(req.nextUrl.searchParams.get("nickname") || "").trim();
    const contactType = String(req.nextUrl.searchParams.get("contactType") || "").trim() as EntryContactType;
    const contactValue = String(req.nextUrl.searchParams.get("contactValue") || "").trim();
    const normalizedContact =
      contactType === "phone"
        ? normalizeUsPhone(contactValue)
        : contactType === "email"
          ? normalizeEmail(contactValue)
          : null;

    if (!nickname || !normalizedContact) {
      const failedAuth = auth as Extract<typeof auth, { ok: false }>;
      return NextResponse.json({ error: failedAuth.error }, { status: failedAuth.status });
    }

    supabase = getServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Server is not configured for entries." }, { status: 500 });
    }

    const fallbackEntry = await supabase
      .from("entries")
      .select("id,nickname_display")
      .eq("contact_type", contactType)
      .eq("contact_value", normalizedContact)
      .maybeSingle();

    let resolvedEntry = fallbackEntry.data;

    if (!resolvedEntry?.id && nickname) {
      const nicknameEntry = await supabase
        .from("entries")
        .select("id,nickname_display")
        .eq("nickname_key", nickname.trim().toLowerCase())
        .maybeSingle();

      if (!nicknameEntry.error && nicknameEntry.data?.id) {
        resolvedEntry = nicknameEntry.data;
      }
    }

    if (fallbackEntry.error || !resolvedEntry?.id) {
      return NextResponse.json({ error: "Login session is required." }, { status: 401 });
    }

    entry = {
      id: Number(resolvedEntry.id),
      nickname: String(resolvedEntry.nickname_display || nickname).trim() || nickname,
    };
  }

  const rows = await supabase
    .from("wallet_coupons")
    .select("id,reward_type,title,description,status,expires_at,redeem_token,created_at,redeemed_at,redeemed_staff_name,redeemed_store_name")
    .eq("entry_id", entry.id)
    .order("created_at", { ascending: false });

  if (rows.error) {
    return NextResponse.json({ error: rows.error.message || "Failed to load wallet." }, { status: 500 });
  }

  const coupons = (rows.data ?? []).map((row) => {
    const resolvedReward = resolveCouponReward(row.reward_type, row.title, row.description);
    const state = getCouponState({
      status: row.status,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at,
    });
    return {
      id: Number(row.id),
      rewardType: resolvedReward?.type || row.reward_type,
      title: row.title || resolvedReward?.title || "Coupon Discount",
      description: row.description || resolvedReward?.description || "",
      status: getWalletCouponStatus({
        status: row.status,
        expiresAt: row.expires_at,
        redeemedAt: row.redeemed_at,
      }),
      state,
      expiresAt: row.expires_at,
      redeemToken: row.redeem_token,
      createdAt: row.created_at,
      redeemedAt: row.redeemed_at,
      redeemedStaffName: row.redeemed_staff_name,
      redeemedStoreName: row.redeemed_store_name,
    };
  });

  return NextResponse.json({
    nickname: entry.nickname,
    coupons,
    activeCoupons: coupons.filter((coupon) => coupon.status === "active"),
    historyCoupons: coupons.filter((coupon) => coupon.status !== "active"),
  });
}
