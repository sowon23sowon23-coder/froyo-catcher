import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow, loginSchema } from "../../../lib/couponData";
import { writePortalSession } from "../../../lib/portalAuth";

export async function POST(req: NextRequest) {
  let parsedBody: unknown;

  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your input values." }, { status: 400 });
  }

  const body = parsed.data;

  if (body.role === "admin") {
    if (!process.env.ADMIN_PANEL_TOKEN || body.password !== process.env.ADMIN_PANEL_TOKEN) {
      return NextResponse.json({ error: "The admin password is incorrect." }, { status: 401 });
    }

    const response = NextResponse.json({
      session: {
        role: "admin" as const,
      },
    });
    writePortalSession(response, { role: "admin" });
    return response;
  }

  const staffPassword =
    process.env.STAFF_PORTAL_PASSWORD ||
    process.env.STAFF_TOKEN ||
    process.env.ADMIN_PANEL_TOKEN;

  if (!staffPassword || body.password !== staffPassword) {
    return NextResponse.json({ error: "The staff password is incorrect." }, { status: 401 });
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
      return NextResponse.json({ error: "Could not verify the staff account." }, { status: 500 });
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
      return NextResponse.json({ error: "This staff account is not active." }, { status: 401 });
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
    return NextResponse.json({ error: "An error occurred while processing the login." }, { status: 500 });
  }
}
