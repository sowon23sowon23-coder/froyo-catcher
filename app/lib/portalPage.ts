import { redirect } from "next/navigation";

import { getPortalSessionFromCookies, isFreshAdminPageEntry } from "./portalAuth";

export function requirePageSession(role: "admin" | "staff", nextPath: string) {
  const session = getPortalSessionFromCookies();
  if (!session || session.role !== role || (role === "admin" && !isFreshAdminPageEntry(session))) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}
