import CompleteBlockScreen from "../components/CompleteBlockScreen";
import CouponIssueClient from "../components/CouponIssueClient";
import { getGameAccessStateForServer } from "../lib/gameAccessServer";

export const dynamic = "force-dynamic";

export default async function CouponPage() {
  const gameAccess = await getGameAccessStateForServer();
  if (gameAccess.pageBlocked) {
    return <CompleteBlockScreen message={gameAccess.message} />;
  }

  return <CouponIssueClient />;
}
