import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type VerifyBody = {
  requestId?: string;
  target?: "old" | "new";
  code?: string;
};

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

export async function POST(req: NextRequest) {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestId = String(body.requestId || "").trim();
  const target = body.target;
  const code = String(body.code || "").trim();
  if (!requestId || (target !== "old" && target !== "new") || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid verification payload." }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const row = await supabase
    .from("contact_change_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (row.error) {
    return NextResponse.json({ error: row.error.message || "Failed to read verification request." }, { status: 500 });
  }
  if (!row.data) {
    return NextResponse.json({ error: "Verification request not found." }, { status: 404 });
  }

  if (row.data.consumed_at) {
    return NextResponse.json({ error: "This verification request is already completed." }, { status: 400 });
  }
  if (new Date(row.data.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Verification code has expired." }, { status: 400 });
  }

  const codeHash = hashCode(code);
  if (target === "old" && row.data.old_code_hash !== codeHash) {
    return NextResponse.json({ error: "Invalid code for current contact." }, { status: 400 });
  }
  if (target === "new" && row.data.new_code_hash !== codeHash) {
    return NextResponse.json({ error: "Invalid code for new contact." }, { status: 400 });
  }

  const patch: Record<string, boolean> = {};
  patch[target === "old" ? "old_verified" : "new_verified"] = true;
  const verified = await supabase
    .from("contact_change_requests")
    .update(patch)
    .eq("id", requestId)
    .select("*")
    .single();

  if (verified.error || !verified.data) {
    return NextResponse.json({ error: verified.error?.message || "Failed to verify code." }, { status: 500 });
  }

  if (!verified.data.old_verified || !verified.data.new_verified) {
    return NextResponse.json({ ok: true, completed: false });
  }

  const updateEntry = await supabase
    .from("entries")
    .update({
      contact_type: verified.data.new_contact_type,
      contact_value: verified.data.new_contact_value,
      consent_at: new Date().toISOString(),
    })
    .eq("id", verified.data.entry_id);

  if (updateEntry.error) {
    if (isUniqueViolation(updateEntry.error as { code?: string })) {
      return NextResponse.json({ error: "New contact is already used by another account." }, { status: 409 });
    }
    return NextResponse.json({ error: updateEntry.error.message || "Failed to update contact." }, { status: 500 });
  }

  const consume = await supabase
    .from("contact_change_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", requestId);
  if (consume.error) {
    return NextResponse.json({ error: consume.error.message || "Failed to finalize contact change." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    completed: true,
    newContactType: verified.data.new_contact_type,
    newContactValue: verified.data.new_contact_value,
  });
}
