import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type FeedbackBody = {
  message?: string;
  nickname?: string | null;
  store?: string | null;
  source?: string | null;
};

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

function isMissingTableError(message?: string | null) {
  const m = (message || "").toLowerCase();
  return m.includes("could not find the table") || m.includes("relation") && m.includes("does not exist");
}

export async function POST(req: NextRequest) {
  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (message.length < 5) {
    return NextResponse.json({ error: "Feedback must be at least 5 characters." }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Server is not configured for feedback." }, { status: 500 });
  }

  const feedbackTable = (process.env.FEEDBACK_TABLE || "user_feedback").trim();

  const payload = {
    message,
    nickname: (body.nickname || "").trim() || null,
    store: (body.store || "").trim() || null,
    source: (body.source || "").trim() || "home_tool",
    user_agent: req.headers.get("user-agent") || null,
  };

  const minimalPayload = {
    message: payload.message,
    nickname: payload.nickname,
    store: payload.store,
  };

  // First try full payload (for richer schema), then minimal payload.
  const first = await supabase.from(feedbackTable).insert([payload]);
  if (!first.error) {
    return NextResponse.json({ ok: true });
  }

  const second = await supabase.from(feedbackTable).insert([minimalPayload]);
  if (!second.error) {
    return NextResponse.json({ ok: true });
  }

  const errMsg = second.error?.message || first.error.message || "Failed to save feedback.";
  if (isMissingTableError(errMsg)) {
    return NextResponse.json(
      {
        error: `Feedback table is missing. Create table '${feedbackTable}' or set FEEDBACK_TABLE.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: errMsg },
    { status: 500 },
  );
}
