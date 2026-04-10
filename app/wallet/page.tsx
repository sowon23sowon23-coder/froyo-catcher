import WalletSecurePageClient from "../components/WalletSecurePageClient";

export default function WalletPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  return <WalletSecurePageClient initialTab={searchParams?.tab} />;
}
