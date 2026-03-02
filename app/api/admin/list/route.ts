import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const store = (req.nextUrl.searchParams.get("store") || "").trim();

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const buildQuery = (selectColumns: string, withScoreOrder: boolean) => {
    let query = adminSupabase
      .from("leaderboard_best_v2")
      .select(selectColumns)
      .limit(5000);

    if (withScoreOrder) {
      query = query.order("score", { ascending: false }).order("updated_at", { ascending: true });
    }

    return query;
  };

  const attempts = [
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at,character,store", true), hasStore: true },
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at,store", true), hasStore: true },
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at,character", true), hasStore: false },
    { run: () => buildQuery("nickname_key,nickname_display,score,updated_at", true), hasStore: false },
    { run: () => buildQuery("nickname_key,nickname_display,score,store,character", false), hasStore: true },
    { run: () => buildQuery("nickname_key,nickname_display,score", false), hasStore: false },
    { run: () => buildQuery("*", false), hasStore: false },
  ];

  let data: any[] | null = null;
  let error: { message?: string } | null = null;
  let supportsStore = false;

  for (const attempt of attempts) {
    const result = await attempt.run();
    if (!result.error) {
      data = (result.data as any[] | null) ?? [];
      error = null;
      supportsStore = attempt.hasStore;
      break;
    }
    error = result.error as { message?: string };
  }

  if (error) {
    return NextResponse.json({ error: "Failed to load leaderboard records.", details: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ store?: string | null }>;
  const enrichWithContacts = async (baseRows: any[]) => {
    const nicknameKeys = Array.from(new Set(baseRows.map((r) => String(r.nickname_key || "")).filter(Boolean)));
    if (nicknameKeys.length === 0) return baseRows;

    const contactRes = await adminSupabase
      .from("entries")
      .select("nickname_key,contact_type,contact_value")
      .in("nickname_key", nicknameKeys);

    const contactMap = new Map<string, { contact_type?: string; contact_value?: string }>();
    if (!contactRes.error && contactRes.data) {
      for (const row of contactRes.data as Array<{
        nickname_key?: string | null;
        contact_type?: string | null;
        contact_value?: string | null;
      }>) {
        const key = String(row.nickname_key || "");
        if (!key || !row.contact_type || !row.contact_value) continue;
        if (!contactMap.has(key)) {
          contactMap.set(key, {
            contact_type: row.contact_type,
            contact_value: row.contact_value,
          });
        }
      }
    }

    return baseRows.map((row) => {
      const contact = contactMap.get(String(row.nickname_key || ""));
      return {
        ...row,
        contact_type: contact?.contact_type ?? null,
        contact_value: contact?.contact_value ?? null,
      };
    });
  };

  if (supportsStore && store && store !== "__ALL__") {
    const wanted = store.trim().toLowerCase();
    const filtered = rows.filter((r) => ((r.store ?? "").trim().toLowerCase() === wanted)) as any[];
    const enriched = await enrichWithContacts(filtered);
    return NextResponse.json(
      { rows: enriched, supportsStore },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }

  const enriched = await enrichWithContacts(rows as any[]);
  return NextResponse.json(
    { rows: enriched, supportsStore },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
}
