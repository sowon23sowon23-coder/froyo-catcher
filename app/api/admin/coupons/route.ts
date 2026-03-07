import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCouponState, getWalletCouponStatus } from "../../../lib/coupons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminCouponStatusFilter = "all" | "active" | "redeemed" | "expired";

function parseLimit(raw: string | null): number {
  const n = Number(raw || 200);
  if (!Number.isFinite(n)) return 200;
  return Math.min(500, Math.max(1, Math.floor(n)));
}

function parseStatus(raw: string | null): AdminCouponStatusFilter {
  if (raw === "active" || raw === "redeemed" || raw === "expired") return raw;
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

  const result = await adminSupabase
    .from("wallet_coupons")
    .select(`
      id,
      entry_id,
      reward_type,
      title,
      description,
      status,
      expires_at,
      created_at,
      redeemed_at,
      redeemed_staff_name,
      redeemed_store_name,
      entries:entries (
        nickname_display,
        nickname_key,
        contact_type,
        contact_value,
        store
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (result.error) {
    return NextResponse.json({ error: result.error.message || "Failed to load coupons." }, { status: 500 });
  }

  const rows = ((result.data ?? []) as any[])
    .map((row) => {
      const state = getCouponState({
        status: row.status,
        expiresAt: row.expires_at,
        redeemedAt: row.redeemed_at,
      });
      const normalizedStatus = getWalletCouponStatus({
        status: row.status,
        expiresAt: row.expires_at,
        redeemedAt: row.redeemed_at,
      });
      const entry = Array.isArray(row.entries) ? row.entries[0] : row.entries;

      return {
        id: Number(row.id),
        entry_id: Number(row.entry_id),
        reward_type: row.reward_type,
        title: row.title,
        description: row.description,
        status: normalizedStatus,
        state,
        expires_at: row.expires_at,
        created_at: row.created_at,
        redeemed_at: row.redeemed_at,
        redeemed_staff_name: row.redeemed_staff_name,
        redeemed_store_name: row.redeemed_store_name,
        nickname_display: entry?.nickname_display ?? null,
        nickname_key: entry?.nickname_key ?? null,
        contact_type: entry?.contact_type ?? null,
        contact_value: entry?.contact_value ?? null,
        store: entry?.store ?? null,
      };
    })
    .filter((row) => status === "all" || row.status === status);

  return NextResponse.json(
    { rows, limit, status },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
