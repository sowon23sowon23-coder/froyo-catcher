import { NextRequest, NextResponse } from "next/server";

import { getPortalSessionFromRequest } from "../../../lib/portalAuth";

export async function GET(req: NextRequest) {
  const session = getPortalSessionFromRequest(req);
  return NextResponse.json({
    authenticated: Boolean(session),
    session,
  });
}
