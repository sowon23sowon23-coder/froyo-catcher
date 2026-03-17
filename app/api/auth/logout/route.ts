import { NextResponse } from "next/server";

import { clearPortalSession } from "../../../lib/portalAuth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearPortalSession(response);
  return response;
}
