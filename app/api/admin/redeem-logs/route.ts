import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";
import { getGameDateRange } from "../../../lib/dallasTime";

type WalletCouponRow = {
  id: number;
  redeem_token: string | null;
  status: string | null;
  created_at: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemed_store_name: string | null;
  redeemed_staff_name: string | null;
};

function escapeCsv(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return value;
}

function getDateRange(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  const dateParam = parseDate(req.nextUrl.searchParams.get("date"));
  const startParam = parseDate(req.nextUrl.searchParams.get("startDate"));
  const endParam = parseDate(req.nextUrl.searchParams.get("endDate"));

  const rangeStart = mode === "range" ? startParam : dateParam;
  const rangeEnd = mode === "range" ? endParam : dateParam;
  if (!rangeStart || !rangeEnd) return null;

  const range = getGameDateRange(rangeStart, rangeEnd);
  if (!range) return null;

  return { startIso: range.startIso, endIso: range.endIso };
}

function getWalletStatus(row: Pick<WalletCouponRow, "status" | "expires_at" | "redeemed_at">) {
  if (row.status === "redeemed" || row.redeemed_at) return "redeemed";
  if (row.status === "expired") return "expired";
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "expired";
  return "active";
}

function formatWalletCode(row: Pick<WalletCouponRow, "id" | "redeem_token">) {
  const token = String(row.redeem_token || "").trim();
  if (token) return token.slice(0, 8).toUpperCase();
  return `WALLET-${row.id}`;
}

function serializeLog(row: WalletCouponRow) {
  const action = getWalletStatus(row);
  return {
    id: Number(row.id),
    code: formatWalletCode(row),
    action_type: action,
    reason: action === "redeemed" ? "Wallet coupon used" : "Wallet coupon expired",
    store_id: row.redeemed_store_name || row.redeemed_by || null,
    staff_id: row.redeemed_staff_name || null,
    order_number: null,
    created_at: String(row.redeemed_at || row.created_at || ""),
  };
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "Admin login is required." }, { status: 401 });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") || 20)));
  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();

  try {
    const supabase = getServiceSupabaseOrThrow();
    const dateRange = getDateRange(req);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("wallet_coupons")
      .select("id,redeem_token,status,created_at,expires_at,redeemed_at,redeemed_by,redeemed_store_name,redeemed_staff_name", { count: "exact" })
      .or(`status.eq.redeemed,status.eq.expired,redeemed_at.not.is.null`)
      .order("redeemed_at", { ascending: false, nullsFirst: false });

    if (dateRange) {
      query = query.gte("created_at", dateRange.startIso).lt("created_at", dateRange.endIso);
    }

    const result = await query.range(from, to);

    if (result.error) {
      console.error("Failed to load wallet coupon logs", result.error);
      return NextResponse.json({ error: "Failed to load redeem logs." }, { status: 500 });
    }

    const rows = ((result.data ?? []) as WalletCouponRow[]).map(serializeLog);
    if (format === "csv") {
      const header = ["id", "code", "action_type", "reason", "store_id", "staff_id", "order_number", "created_at"];
      const content = [
        header.join(","),
        ...rows.map((row) =>
          [
            row.id,
            escapeCsv(row.code),
            escapeCsv(row.action_type),
            escapeCsv(row.reason),
            escapeCsv(row.store_id),
            escapeCsv(row.staff_id),
            escapeCsv(row.order_number),
            escapeCsv(row.created_at),
          ].join(",")
        ),
      ].join("\n");

      return new NextResponse(content, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="redeem-logs-page-${page}.csv"`,
        },
      });
    }

    return NextResponse.json({
      page,
      pageSize,
      total: result.count || 0,
      rows,
    });
  } catch (error) {
    console.error("Admin redeem logs route error", error);
    return NextResponse.json({ error: "An error occurred while loading redeem logs." }, { status: 500 });
  }
}
