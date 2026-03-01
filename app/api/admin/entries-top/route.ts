import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatEntryCode } from "../../../lib/entry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CouponStatusFilter = "pending" | "sent" | "failed" | "all";

function parseLimit(raw: string | null): number {
  const n = Number(raw || 20);
  if (!Number.isFinite(n)) return 20;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function parseStatus(raw: string | null): CouponStatusFilter {
  if (raw === "pending" || raw === "sent" || raw === "failed") return raw;
  return "all";
}

export async function GET(req: NextRequest) {
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

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const status = parseStatus(req.nextUrl.searchParams.get("status"));

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = adminSupabase
    .from("entries")
    .select("id,contact_type,contact_value,score_best,coupon_status,coupon_sent_at,created_at")
    .order("score_best", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("coupon_status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message || "Failed to load entries." }, { status: 500 });
  }

  const rows = (data || []).map((row: any) => ({
    ...row,
    entry_code: formatEntryCode(Number(row.id)),
  }));

  return NextResponse.json(
    { rows, limit, status },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}

