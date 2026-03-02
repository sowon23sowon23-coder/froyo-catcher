import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail, normalizeUsPhone, type EntryContactType } from "../../../lib/entry";

type RegisterEntryBody = {
  contactType?: EntryContactType;
  contactValue?: string;
  nickname?: string | null;
  store?: string | null;
  scoreBest?: number | null;
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

export async function POST(req: NextRequest) {
  let body: RegisterEntryBody;
  try {
    body = (await req.json()) as RegisterEntryBody;
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

  const nickname = String(body.nickname || "").trim();
  const store = String(body.store || "").trim();
  const incomingBest = normalizeScoreBest(body.scoreBest);

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured for entries." }, { status: 500 });
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

  const existingBest = Number(existing.data?.score_best ?? 0);
  const nextBest = Math.max(existingBest, incomingBest);
  const consentAt = new Date().toISOString();

  if (existing.data?.id) {
    const updatePayloads = [
      {
        consent_at: consentAt,
        score_best: nextBest,
        nickname_display: nickname || null,
        store: store || null,
      },
      {
        consent_at: consentAt,
        score_best: nextBest,
      },
    ];

    let lastError: { message?: string } | null = null;
    for (const patch of updatePayloads) {
      const result = await supabase.from("entries").update(patch).eq("id", existing.data.id);
      if (!result.error) {
        return NextResponse.json({ ok: true, score_best: nextBest });
      }
      lastError = result.error as { message?: string };
    }

    return NextResponse.json({ error: lastError?.message || "Failed to update entry." }, { status: 500 });
  }

  const insertPayloads = [
    {
      contact_type: contactType,
      contact_value: normalizedContact,
      consent_at: consentAt,
      score_best: nextBest,
      nickname_display: nickname || null,
      store: store || null,
    },
    {
      contact_type: contactType,
      contact_value: normalizedContact,
      consent_at: consentAt,
      score_best: nextBest,
    },
  ];

  let lastError: { message?: string } | null = null;
  for (const payload of insertPayloads) {
    const result = await supabase.from("entries").insert([payload]);
    if (!result.error) {
      return NextResponse.json({ ok: true, score_best: nextBest });
    }
    lastError = result.error as { message?: string };
  }

  return NextResponse.json({ error: lastError?.message || "Failed to create entry." }, { status: 500 });
}
