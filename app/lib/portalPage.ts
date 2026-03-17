import { redirect } from "next/navigation";

import { getPortalSessionFromCookies } from "./portalAuth";

export function requirePageSession(role: "admin" | "staff", nextPath: string) {
  const session = getPortalSessionFromCookies();
  if (!session || session.role !== role) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return session;
}
