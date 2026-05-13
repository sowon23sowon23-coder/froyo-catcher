import { redirect } from "next/navigation";

import PortalLoginClient from "../components/PortalLoginClient";
import { getPortalSessionFromCookies } from "../lib/portalAuth";

function normalizeNextPath(nextPath?: string) {
  if (!nextPath || !nextPath.startsWith("/")) return "/redeem";
  if (nextPath.startsWith("//")) return "/redeem";
  return nextPath;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = normalizeNextPath(searchParams?.next);
  const session = getPortalSessionFromCookies();
  const adminLoginRequested = nextPath.startsWith("/admin");

  if (session && !adminLoginRequested) {
    redirect(session.role === "admin" ? "/admin" : nextPath || "/redeem");
  }

  return <PortalLoginClient nextPath={nextPath} />;
}
