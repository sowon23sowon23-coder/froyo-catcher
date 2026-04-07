import { NextRequest, NextResponse } from "next/server";

import { adminCreateCouponSchema, getServiceSupabaseOrThrow, serializeCouponSummary } from "../../../lib/couponData";
import { createCouponCode, getCouponExpiryIso, getCouponStatus, normalizeCouponCode } from "../../../lib/couponMvp";
import { requirePortalRole } from "../../../lib/portalAuth";

async function createUniqueCouponCode() {
  const supabase = getServiceSupabaseOrThrow();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createCouponCode();
    const existing = await supabase.from("coupons").select("id").eq("code", code).maybeSingle();
    if (!existing.data?.id) return code;
  }

  throw new Error("Failed to create a unique coupon code.");
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "Admin login is required." }, { status: 401 });
  }

  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 30)));
  const search = normalizeCouponCode(req.nextUrl.searchParams.get("search") || "");

  try {
    const supabase = getServiceSupabaseOrThrow();
    let query = supabase.from("coupons").select("*").order("created_at", { ascending: false }).limit(limit);
    if (search) query = query.eq("code", search);

    const result = await query;
    if (result.error) {
      console.error("Failed to load coupons", result.error);
      return NextResponse.json({ error: "Failed to load the coupon list." }, { status: 500 });
    }

    return NextResponse.json({
      rows: (result.data ?? []).map((row) => serializeCouponSummary(row, getCouponStatus(row))),
    });
  } catch (error) {
    console.error("Admin coupons GET route error", error);
    return NextResponse.json({ error: "An error occurred while loading the coupon list." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "Admin login is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = adminCreateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the coupon creation inputs." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const code = await createUniqueCouponCode();
    const expiresAt = parsed.data.expiresAt || getCouponExpiryIso();

    const inserted = await supabase
      .from("coupons")
      .insert([
        {
          code,
          user_id: parsed.data.userId || null,
          coupon_name: parsed.data.couponName,
          reward_type: "manual_discount",
          discount_amount: parsed.data.discountAmount,
          status: "unused",
          issued_at: new Date().toISOString(),
          expires_at: expiresAt,
        },
      ])
      .select("*")
      .single();

    if (inserted.error) {
      console.error("Failed to create manual coupon", inserted.error);
      return NextResponse.json({ error: "Failed to create the admin coupon." }, { status: 500 });
    }

    return NextResponse.json({
      coupon: serializeCouponSummary(inserted.data),
    });
  } catch (error) {
    console.error("Admin coupons POST route error", error);
    return NextResponse.json({ error: "An error occurred while creating the admin coupon." }, { status: 500 });
  }
}
