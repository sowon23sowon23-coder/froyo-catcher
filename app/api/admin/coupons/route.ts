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
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
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
      return NextResponse.json({ error: "쿠폰 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      rows: (result.data ?? []).map((row) => serializeCouponSummary(row, getCouponStatus(row))),
    });
  } catch (error) {
    console.error("Admin coupons GET route error", error);
    return NextResponse.json({ error: "쿠폰 목록 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = adminCreateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "쿠폰 생성 입력값을 확인해 주세요." }, { status: 400 });
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
      return NextResponse.json({ error: "관리자 쿠폰 생성에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      coupon: serializeCouponSummary(inserted.data),
    });
  } catch (error) {
    console.error("Admin coupons POST route error", error);
    return NextResponse.json({ error: "관리자 쿠폰 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
