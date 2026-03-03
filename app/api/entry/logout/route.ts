import { NextResponse } from "next/server";
import { ENTRY_SESSION_COOKIE } from "../../../lib/entrySession";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ENTRY_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
