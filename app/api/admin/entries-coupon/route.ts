import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatEntryCode } from "../../../lib/entry";

type UpdateCouponBody = {
  entryId?: number;
  couponStatus?: "pending" | "sent" | "failed";
};

function isValidCouponStatus(value: string): value is "pending" | "sent" | "failed" {
  return value === "pending" || value === "sent" || value === "failed";
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!adminToken || !serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token !== adminToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: UpdateCouponBody;
  try {
    body = (await req.json()) as UpdateCouponBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const entryId = Number(body.entryId);
  const couponStatus = String(body.couponStatus || "");

  if (!Number.isInteger(entryId) || entryId <= 0) {
    return NextResponse.json({ error: "entryId must be a positive integer." }, { status: 400 });
  }
  if (!isValidCouponStatus(couponStatus)) {
    return NextResponse.json({ error: "Invalid coupon status." }, { status: 400 });
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const patch: { coupon_status: string; coupon_sent_at: string | null } = {
    coupon_status: couponStatus,
    coupon_sent_at: couponStatus === "sent" ? new Date().toISOString() : null,
  };

  const { data, error } = await adminSupabase
    .from("entries")
    .update(patch)
    .eq("id", entryId)
    .select("id,contact_type,contact_value,score_best,coupon_status,coupon_sent_at,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to update coupon status." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  return NextResponse.json({
    row: {
      ...data,
      entry_code: formatEntryCode(Number(data.id)),
    },
  });
}

