import CompleteBlockScreen from "../components/CompleteBlockScreen";
import { getGameAccessStateForServer } from "../lib/gameAccessServer";
import WalletPageClient from "./WalletPageClient";

export default async function WalletPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const gameAccess = await getGameAccessStateForServer();
  if (gameAccess.pageBlocked) {
    return <CompleteBlockScreen message={gameAccess.message} />;
  }

  return <WalletPageClient initialTab={searchParams?.tab} />;
}
