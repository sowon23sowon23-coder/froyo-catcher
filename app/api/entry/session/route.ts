import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ENTRY_SESSION_COOKIE, verifyEntrySessionToken } from "../../../lib/entrySession";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isNoRowsError(message?: string | null) {
  const m = (message || "").toLowerCase();
  return m.includes("no rows");
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(ENTRY_SESSION_COOKIE)?.value || "";
  const session = verifyEntrySessionToken(token);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured for entries." }, { status: 500 });
  }

  const current = await supabase
    .from("entries")
    .select("id,nickname_key,nickname_display,contact_type,contact_value")
    .eq("id", session.entryId)
    .maybeSingle();

  if (current.error && !isNoRowsError(current.error.message)) {
    return NextResponse.json({ error: current.error.message || "Failed to load session." }, { status: 500 });
  }
  if (!current.data?.id) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  if (
    current.data.nickname_key !== session.nicknameKey ||
    current.data.contact_type !== session.contactType ||
    current.data.contact_value !== session.contactValue
  ) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const nickname = String(current.data.nickname_display || "").trim();

  return NextResponse.json({
    authenticated: true,
    nickname,
    contactType: session.contactType,
    contactValue: session.contactValue,
  });
}
