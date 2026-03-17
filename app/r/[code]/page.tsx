import { redirect } from "next/navigation";

export default function CouponRedirectPage({
  params,
}: {
  params: { code: string };
}) {
  redirect(`/redeem?code=${encodeURIComponent(params.code)}`);
}
