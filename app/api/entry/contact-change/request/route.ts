import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizeUsPhone, type EntryContactType } from "../../../../lib/entry";

type RequestBody = {
  nickname?: string;
  oldContactType?: EntryContactType;
  oldContactValue?: string;
  newContactType?: EntryContactType;
  newContactValue?: string;
};

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeContact(type: EntryContactType, raw: string): string | null {
  return type === "phone" ? normalizeUsPhone(raw) : normalizeEmail(raw);
}

function normalizeNicknameKey(raw: string) {
  return raw.trim().toLowerCase();
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function allowRateLimit(
  supabase: any,
  key: string,
  limit: number,
  windowSeconds: number
) {
  const result = await (supabase as any).rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (result.error) return false;
  return Boolean(result.data);
}

async function dispatchOtp(type: EntryContactType, value: string, code: string, role: "old" | "new") {
  const webhook = (process.env.CONTACT_OTP_WEBHOOK_URL || "").trim();
  if (!webhook) return false;

  const payload = {
    role,
    contactType: type,
    contactValue: value,
    code,
    message: `Your contact change verification code is ${code}.`,
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const nickname = String(body.nickname || "").trim();
  if (nickname.length < 2 || nickname.length > 12) {
    return NextResponse.json({ error: "Nickname must be 2-12 characters." }, { status: 400 });
  }
  const nicknameKey = normalizeNicknameKey(nickname);

  const oldContactType = body.oldContactType;
  const newContactType = body.newContactType;
  if ((oldContactType !== "phone" && oldContactType !== "email") || (newContactType !== "phone" && newContactType !== "email")) {
    return NextResponse.json({ error: "Invalid contact type." }, { status: 400 });
  }

  const oldContactValue = normalizeContact(oldContactType, String(body.oldContactValue || "").trim());
  const newContactValue = normalizeContact(newContactType, String(body.newContactValue || "").trim());
  if (!oldContactValue || !newContactValue) {
    return NextResponse.json({ error: "Invalid contact value." }, { status: 400 });
  }
  if (oldContactType === newContactType && oldContactValue === newContactValue) {
    return NextResponse.json({ error: "New contact must be different." }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
  const allowed = await allowRateLimit(supabase, `contact-change-request:${nicknameKey}:${ip}`, 6, 600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const owner = await supabase
    .from("entries")
    .select("id,contact_type,contact_value")
    .eq("nickname_key", nicknameKey)
    .maybeSingle();
  if (owner.error) {
    return NextResponse.json({ error: owner.error.message || "Failed to verify nickname." }, { status: 500 });
  }
  if (!owner.data?.id) {
    return NextResponse.json({ error: "Nickname not found." }, { status: 404 });
  }
  if (owner.data.contact_type !== oldContactType || owner.data.contact_value !== oldContactValue) {
    return NextResponse.json({ error: "Current contact does not match this nickname." }, { status: 403 });
  }

  const duplicateNewContact = await supabase
    .from("entries")
    .select("id")
    .eq("contact_type", newContactType)
    .eq("contact_value", newContactValue)
    .neq("id", owner.data.id)
    .maybeSingle();
  if (duplicateNewContact.error && duplicateNewContact.error.code !== "PGRST116") {
    return NextResponse.json({ error: duplicateNewContact.error.message || "Failed to validate new contact." }, { status: 500 });
  }
  if (duplicateNewContact.data?.id) {
    return NextResponse.json({ error: "This new contact is already in use." }, { status: 409 });
  }

  const oldCode = generateCode();
  const newCode = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const inserted = await supabase
    .from("contact_change_requests")
    .insert([
      {
        entry_id: owner.data.id,
        nickname_key: nicknameKey,
        old_contact_type: oldContactType,
        old_contact_value: oldContactValue,
        new_contact_type: newContactType,
        new_contact_value: newContactValue,
        old_code_hash: hashCode(oldCode),
        new_code_hash: hashCode(newCode),
        expires_at: expiresAt,
      },
    ])
    .select("id,expires_at")
    .single();

  if (inserted.error || !inserted.data?.id) {
    return NextResponse.json({ error: inserted.error?.message || "Failed to create verification request." }, { status: 500 });
  }

  const oldSent = await dispatchOtp(oldContactType, oldContactValue, oldCode, "old");
  const newSent = await dispatchOtp(newContactType, newContactValue, newCode, "new");
  const hasWebhook = Boolean((process.env.CONTACT_OTP_WEBHOOK_URL || "").trim());

  if (process.env.NODE_ENV === "production" && hasWebhook && (!oldSent || !newSent)) {
    return NextResponse.json({ error: "Failed to send verification codes." }, { status: 500 });
  }

  const debugCodes =
    process.env.NODE_ENV !== "production"
      ? { oldCode, newCode }
      : undefined;

  return NextResponse.json({
    ok: true,
    requestId: inserted.data.id,
    expiresAt: inserted.data.expires_at,
    ...(debugCodes ? { debugCodes } : {}),
    note: hasWebhook
      ? "Verification codes sent."
      : "OTP delivery webhook is not configured. Debug codes are returned in non-production only.",
  });
}
