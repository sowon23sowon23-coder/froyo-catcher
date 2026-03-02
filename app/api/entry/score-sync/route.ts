import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizeUsPhone, type EntryContactType } from "../../../lib/entry";

type ScoreSyncBody = {
  contactType?: EntryContactType;
  contactValue?: string;
  scoreBest?: number | null;
  nickname?: string | null;
  store?: string | null;
};

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeScoreBest(raw: unknown): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeContact(
  contactType: EntryContactType,
  contactValue: string
): string | null {
  if (contactType === "phone") return normalizeUsPhone(contactValue);
  return normalizeEmail(contactValue);
}

function isNoRowsError(message?: string | null) {
  const m = (message || "").toLowerCase();
  return m.includes("no rows");
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505";
}

function normalizeNicknameKey(raw: string) {
  return raw.trim().toLowerCase();
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
  let body: ScoreSyncBody;
  try {
    body = (await req.json()) as ScoreSyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const contactType = body.contactType;
  if (contactType !== "phone" && contactType !== "email") {
    return NextResponse.json({ error: "Invalid contact type." }, { status: 400 });
  }

  const rawContactValue = String(body.contactValue || "").trim();
  const normalizedContact = normalizeContact(contactType, rawContactValue);
  if (!normalizedContact) {
    return NextResponse.json({ error: "Invalid contact value." }, { status: 400 });
  }

  const incomingBest = normalizeScoreBest(body.scoreBest);
  if (incomingBest <= 0) {
    return NextResponse.json({ error: "scoreBest must be a positive integer." }, { status: 400 });
  }

  const nickname = String(body.nickname || "").trim();
  if (nickname.length < 2 || nickname.length > 12) {
    return NextResponse.json({ error: "Nickname must be 2-12 characters." }, { status: 400 });
  }
  const nicknameKey = normalizeNicknameKey(nickname);
  const store = String(body.store || "").trim();

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured for entries." }, { status: 500 });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
  const allowed = await allowRateLimit(
    supabase,
    `entry-score-sync:${contactType}:${normalizedContact}:${ip}`,
    20,
    60
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const existing = await supabase
    .from("entries")
    .select("id,score_best")
    .eq("contact_type", contactType)
    .eq("contact_value", normalizedContact)
    .maybeSingle();

  if (existing.error && !isNoRowsError(existing.error.message)) {
    return NextResponse.json({ error: existing.error.message || "Failed to read entry." }, { status: 500 });
  }
  if (!existing.data?.id) {
    return NextResponse.json({ error: "Entry not found. Register contact first." }, { status: 404 });
  }

  const nicknameOwner = await supabase
    .from("entries")
    .select("id")
    .eq("nickname_key", nicknameKey)
    .maybeSingle();
  if (nicknameOwner.error && !isNoRowsError(nicknameOwner.error.message)) {
    return NextResponse.json({ error: nicknameOwner.error.message || "Failed to verify nickname." }, { status: 500 });
  }
  if (
    nicknameOwner.data?.id &&
    Number(nicknameOwner.data.id) !== Number(existing.data.id)
  ) {
    return NextResponse.json({ error: "Nickname is already in use." }, { status: 409 });
  }

  const existingBest = Number(existing.data.score_best ?? 0);
  const nextBest = Math.max(existingBest, incomingBest);

  const updatePayloads = [
    {
      score_best: nextBest,
      nickname_key: nicknameKey,
      nickname_display: nickname || null,
      store: store || null,
    },
    {
      score_best: nextBest,
      nickname_key: nicknameKey,
    },
  ];

  let lastError: { message?: string } | null = null;
  for (const patch of updatePayloads) {
    const result = await supabase.from("entries").update(patch).eq("id", existing.data.id);
    if (!result.error) {
      return NextResponse.json({ ok: true, score_best: nextBest });
    }
    if (isUniqueViolation(result.error as { code?: string; message?: string })) {
      return NextResponse.json({ error: "Nickname is already in use." }, { status: 409 });
    }
    lastError = result.error as { message?: string };
  }

  return NextResponse.json({ error: lastError?.message || "Failed to sync score." }, { status: 500 });
}
