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
    // Fallback: the kiosk client may send contact credentials from localStorage
    // when a session cookie is absent (e.g. page reload after session expiry).
    // Both nickname AND a valid normalized contact value are required; a match
    // must exist in the entries table. This prevents unauthenticated enumeration
    // by nickname or contact alone.
    const nickname = String(req.nextUrl.searchParams.get("nickname") || "").trim();
    const contactType = String(req.nextUrl.searchParams.get("contactType") || "").trim() as EntryContactType;
    const contactValue = String(req.nextUrl.searchParams.get("contactValue") || "").trim();

    // Reject fallback if basic required fields are missing or contactType is invalid.
    if (!nickname || !contactValue || (contactType !== "phone" && contactType !== "email")) {
      const failedAuth = auth as Extract<typeof auth, { ok: false }>;
      return NextResponse.json({ error: failedAuth.error }, { status: failedAuth.status });
    }

    const normalizedContact =
      contactType === "phone"
        ? normalizeUsPhone(contactValue)
        : normalizeEmail(contactValue);

    if (!normalizedContact) {
      return NextResponse.json({ error: "Login session is required." }, { status: 401 });
    }

    supabase = getServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Server is not configured for entries." }, { status: 500 });
    }

    // Must match BOTH contact_value AND nickname to prevent cross-account access.
    const fallbackEntry = await supabase
      .from("entries")
      .select("id,nickname_display,nickname_key")
      .eq("contact_type", contactType)
      .eq("contact_value", normalizedContact)
      .maybeSingle();

    if (fallbackEntry.error || !fallbackEntry.data?.id) {
      return NextResponse.json({ error: "Login session is required." }, { status: 401 });
    }

    // Verify nickname matches the entry — prevents a known contact value from
    // being used to access a different account.
    const storedNicknameKey = String(fallbackEntry.data.nickname_key || "").toLowerCase();
    const providedNicknameKey = nickname.toLowerCase();
    if (storedNicknameKey !== providedNicknameKey) {
      return NextResponse.json({ error: "Login session is required." }, { status: 401 });
    }

    entry = {
      id: Number(fallbackEntry.data.id),
      nickname: String(fallbackEntry.data.nickname_display || nickname).trim() || nickname,
    };
  }

  const todayMidnightUtc = new Date();
  todayMidnightUtc.setUTCHours(0, 0, 0, 0);

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

  // canActivateToday: false if the user already activated or redeemed a coupon today.
  const todayIso = todayMidnightUtc.toISOString();
  const activatedTodayCount = (rows.data ?? []).filter(
    (row) =>
      (row.status === "expired" && row.created_at >= todayIso) ||
      (row.status === "redeemed" && row.redeemed_at && row.redeemed_at >= todayIso)
  ).length;

  // nextIssuanceAt: when the 24h rolling issuance window reopens (null = can issue now)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const latestIssuedRow = (rows.data ?? []).find((row) => row.created_at >= twentyFourHoursAgo);
  const nextIssuanceAt = latestIssuedRow
    ? new Date(new Date(latestIssuedRow.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  return NextResponse.json({
    nickname: entry.nickname,
    coupons,
    activeCoupons: coupons.filter((coupon) => coupon.status === "active"),
    historyCoupons: coupons.filter((coupon) => coupon.status !== "active"),
    canActivateToday: activatedTodayCount < 1,
    nextIssuanceAt,
  });
}
