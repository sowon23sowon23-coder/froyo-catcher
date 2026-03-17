import { NextRequest, NextResponse } from "next/server";

import { getServiceSupabaseOrThrow } from "../../../lib/couponData";
import { requirePortalRole } from "../../../lib/portalAuth";

function escapeCsv(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export async function GET(req: NextRequest) {
  const session = requirePortalRole(req, ["admin"]);
  if (!session) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") || 20)));
  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();

  try {
    const supabase = getServiceSupabaseOrThrow();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const result = await supabase
      .from("redeem_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (result.error) {
      console.error("Failed to load redeem logs", result.error);
      return NextResponse.json({ error: "리딤 로그를 불러오지 못했습니다." }, { status: 500 });
    }

    const rows = result.data ?? [];
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
    return NextResponse.json({ error: "리딤 로그 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
