import { headers } from "next/headers";
import RedeemPageClient from "../../components/RedeemPageClient";
import { type CouponState } from "../../lib/coupons";

async function fetchInitialRedeemState(token: string) {
  const headerList = headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/coupons/redeem/${token}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return { state: "invalid" as CouponState };
    }

    return (await res.json()) as {
      state: CouponState;
      coupon?: {
        id: number;
        title: string;
        description: string;
        expiresAt: string;
        redeemedAt?: string | null;
      };
    };
  } catch {
    return { state: "invalid" as CouponState };
  }
}

export default async function RedeemPage({ params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  const initialData = await fetchInitialRedeemState(token);

  return <RedeemPageClient token={token} initialData={initialData} />;
}
