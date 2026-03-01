import { NextRequest, NextResponse } from "next/server";

type VerifyBody = {
  password?: string;
};

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_PANEL_TOKEN;
  if (!adminToken) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const password = (body.password || "").trim();
  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (password !== adminToken) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

