import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, loginSchema } from "../../../lib/couponData";
import { writePortalSession } from "../../../lib/portalAuth";

export async function POST(req: NextRequest) {
  let parsedBody: unknown;

  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값을 다시 확인해 주세요." }, { status: 400 });
  }

  const body = parsed.data;

  if (body.role === "admin") {
    if (!process.env.ADMIN_PANEL_TOKEN || body.password !== process.env.ADMIN_PANEL_TOKEN) {
      return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const response = NextResponse.json({
      session: {
        role: "admin" as const,
      },
    });
    writePortalSession(response, { role: "admin" });
    return response;
  }

  if (!process.env.STAFF_PORTAL_PASSWORD || body.password !== process.env.STAFF_PORTAL_PASSWORD) {
    return NextResponse.json({ error: "직원 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabaseOrThrow();
    const staffResult = await supabase
      .from("staff_users")
      .select("id,name,store_id,active,stores:stores(id,name,active)")
      .eq("id", body.staffId)
      .eq("store_id", body.storeId)
      .maybeSingle();

    if (staffResult.error) {
      console.error("Failed to load staff user", staffResult.error);
      return NextResponse.json({ error: "직원 정보를 확인하지 못했습니다." }, { status: 500 });
    }

    const staff = staffResult.data as
      | {
          id: string;
          name: string;
          store_id: string;
          active: boolean;
          stores?: { id: string; name: string; active: boolean } | { id: string; name: string; active: boolean }[] | null;
        }
      | null;

    const store = Array.isArray(staff?.stores) ? staff?.stores[0] : staff?.stores;

    if (!staff || !staff.active || !store?.active) {
      return NextResponse.json({ error: "활성화된 직원 계정이 아닙니다." }, { status: 401 });
    }

    const response = NextResponse.json({
      session: {
        role: "staff" as const,
        staffId: staff.id,
        staffName: staff.name,
        storeId: staff.store_id,
        storeName: store.name,
      },
    });

    writePortalSession(response, {
      role: "staff",
      staffId: staff.id,
      staffName: staff.name,
      storeId: staff.store_id,
      storeName: store.name,
    });

    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "로그인 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
