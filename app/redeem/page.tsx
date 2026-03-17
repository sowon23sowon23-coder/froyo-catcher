import RedeemConsoleClient from "../components/RedeemConsoleClient";
import { requirePageSession } from "../lib/portalPage";

export default function RedeemPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
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
