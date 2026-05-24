import CompleteBlockScreen from "../components/CompleteBlockScreen";
import RedeemConsoleClient from "../components/RedeemConsoleClient";
import { getGameAccessStateForServer } from "../lib/gameAccessServer";
import { requirePageSession } from "../lib/portalPage";

export default async function RedeemPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const gameAccess = await getGameAccessStateForServer();
  if (gameAccess.pageBlocked) {
    return <CompleteBlockScreen message={gameAccess.message} />;
  }

  const session = requirePageSession(
    "staff",
    `/redeem${searchParams?.code ? `?code=${encodeURIComponent(searchParams.code)}` : ""}`
  );

  return (
    <RedeemConsoleClient
      session={{
        staffId: session.staffId || "",
        staffName: session.staffName || "",
        storeId: session.storeId || "",
        storeName: session.storeName || session.storeId || "",
      }}
      initialCode={searchParams?.code}
    />
  );
}
