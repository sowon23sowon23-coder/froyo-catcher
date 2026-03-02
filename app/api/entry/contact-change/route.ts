import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizeUsPhone, type EntryContactType } from "../../../lib/entry";
import {
  createEntrySessionToken,
  ENTRY_SESSION_COOKIE,
  verifyEntrySessionToken,
} from "../../../lib/entrySession";

type ContactChangeBody = {
  nickname?: string | null;
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

function normalizeContact(contactType: EntryContactType, contactValue: string): string | null {
  if (contactType === "phone") return normalizeUsPhone(contactValue);
  return normalizeEmail(contactValue);
}

function normalizeNicknameKey(raw: string) {
  return raw.trim().toLowerCase();
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

function isNoRowsError(message?: string | null) {
  const m = (message || "").toLowerCase();
  return m.includes("no rows");
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

export async function POST(req: NextRequest) {
  let body: ContactChangeBody;
  try {
    body = (await req.json()) as ContactChangeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = req.cookies.get(ENTRY_SESSION_COOKIE)?.value || "";
  const session = verifyEntrySessionToken(token);
  if (!session) {
    return NextResponse.json({ error: "Login session is required." }, { status: 401 });
  }

  const nickname = String(body.nickname || "").trim();
  if (nickname) {
    const nicknameKey = normalizeNicknameKey(nickname);
    if (nicknameKey !== session.nicknameKey) {
      return NextResponse.json({ error: "Nickname does not match current login session." }, { status: 403 });
    }
  }

  const newContactType = body.newContactType;
  if (newContactType !== "phone" && newContactType !== "email") {
    return NextResponse.json({ error: "Invalid contact type." }, { status: 400 });
  }

  const rawNewContact = String(body.newContactValue || "").trim();
  const normalizedNewContact = normalizeContact(newContactType, rawNewContact);
  if (!normalizedNewContact) {
    return NextResponse.json({ error: "Invalid contact value." }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured for contact change." }, { status: 500 });
  }

  const current = await supabase
    .from("entries")
    .select("id,nickname_key,contact_type,contact_value")
    .eq("id", session.entryId)
    .maybeSingle();

  if (current.error && !isNoRowsError(current.error.message)) {
    return NextResponse.json({ error: current.error.message || "Failed to load current entry." }, { status: 500 });
  }
  if (!current.data?.id) {
    return NextResponse.json({ error: "Session is invalid. Please log in again." }, { status: 401 });
  }

  if (
    current.data.nickname_key !== session.nicknameKey ||
    current.data.contact_type !== session.contactType ||
    current.data.contact_value !== session.contactValue
  ) {
    return NextResponse.json({ error: "Session is stale. Please log in again." }, { status: 401 });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
  const allowed = await allowRateLimit(
    supabase,
    `entry-contact-change:${session.entryId}:${ip}`,
    6,
    300
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  if (
    current.data.contact_type === newContactType &&
    current.data.contact_value === normalizedNewContact
  ) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      contactType: newContactType,
      contactValue: normalizedNewContact,
    });
  }

  const updated = await supabase
    .from("entries")
    .update({
      contact_type: newContactType,
      contact_value: normalizedNewContact,
      consent_at: new Date().toISOString(),
    })
    .eq("id", session.entryId);

  if (updated.error) {
    if (isUniqueViolation(updated.error as { code?: string })) {
      return NextResponse.json({ error: "That contact is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: updated.error.message || "Failed to update contact." }, { status: 500 });
  }

  const nextToken = createEntrySessionToken({
    entryId: session.entryId,
    nicknameKey: session.nicknameKey,
    contactType: newContactType,
    contactValue: normalizedNewContact,
  });

  const res = NextResponse.json({
    ok: true,
    contactType: newContactType,
    contactValue: normalizedNewContact,
  });
  if (nextToken) {
    res.cookies.set({
      name: ENTRY_SESSION_COOKIE,
      value: nextToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

