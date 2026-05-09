import WalletPageClient from "./WalletPageClient";

export default function WalletPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  return <WalletPageClient initialTab={searchParams?.tab} />;
}
