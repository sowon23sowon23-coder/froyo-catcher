import { NextRequest } from "next/server";
import { ENTRY_SESSION_COOKIE, verifyEntrySessionToken } from "./entrySession";
import { getServerSupabase } from "./serverSupabase";

type AuthenticatedEntry = {
  id: number;
  nickname: string;
  nicknameKey: string;
  contactType: "phone" | "email";
  contactValue: string;
};

type EntrySessionResult =
  | { ok: true; entry: AuthenticatedEntry; supabase: NonNullable<ReturnType<typeof getServerSupabase>> }
  | { ok: false; status: number; error: string };

function isNoRowsError(message?: string | null) {
  const m = (message || "").toLowerCase();
  return m.includes("no rows");
}

export async function requireAuthenticatedEntry(req: NextRequest): Promise<EntrySessionResult> {
  const token = req.cookies.get(ENTRY_SESSION_COOKIE)?.value || "";
  const session = verifyEntrySessionToken(token);
  if (!session) {
    return { ok: false, status: 401, error: "Login session is required." };
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return { ok: false, status: 500, error: "Server is not configured for entries." };
  }

  const current = await supabase
    .from("entries")
    .select("id,nickname_key,nickname_display,contact_type,contact_value")
    .eq("id", session.entryId)
    .maybeSingle();

  if (current.error && !isNoRowsError(current.error.message)) {
    return { ok: false, status: 500, error: current.error.message || "Failed to load session." };
  }
  if (!current.data?.id) {
    return { ok: false, status: 401, error: "Login session is invalid." };
  }

  if (
    current.data.nickname_key !== session.nicknameKey ||
    current.data.contact_type !== session.contactType ||
    current.data.contact_value !== session.contactValue
  ) {
    return { ok: false, status: 401, error: "Login session is invalid." };
  }

  return {
    ok: true,
    supabase,
    entry: {
      id: Number(current.data.id),
      nickname: String(current.data.nickname_display || "").trim(),
      nicknameKey: String(current.data.nickname_key || "").trim(),
      contactType: session.contactType,
      contactValue: session.contactValue,
    },
  };
}
