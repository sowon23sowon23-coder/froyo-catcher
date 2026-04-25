"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCouponExpiry, type CouponState } from "../lib/coupons";

type RedeemCoupon = {
  id: number;
  title: string;
  description: string;
  status?: "active" | "redeemed" | "expired";
  expiresAt: string;
  redeemedAt?: string | null;
  redeemedStaffName?: string | null;
  redeemedStoreName?: string | null;
};

type RedeemResponse = {
  state: CouponState;
  redeemedNow?: boolean;
  coupon?: RedeemCoupon;
};

const LOCAL_WALLET_STORAGE_KEY = "walletCouponsLocal";

function stateLabel(state: CouponState) {
  if (state === "valid") return "Valid";
  if (state === "already_redeemed") return "Already Redeemed";
  if (state === "expired") return "Expired";
  return "Invalid";
}

function stateClasses(state: CouponState) {
  if (state === "valid") return "border-[#c6efb2] bg-[#f3ffeb] text-[#3f6b13]";
  if (state === "already_redeemed") return "border-[#d8c6ef] bg-[#faf5ff] text-[#6b21a8]";
  if (state === "expired") return "border-[#ffd3ad] bg-[#fff7ed] text-[#9a3412]";
  return "border-[#f2bfd9] bg-[#fff4fa] text-[var(--yl-primary)]";
}

export default function RedeemPageClient({
  token,
  initialData,
}: {
  token: string;
  initialData: RedeemResponse;
}) {
  const [data, setData] = useState<RedeemResponse>(initialData);
  const [staffName, setStaffName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redeemDisabled = useMemo(
    () => loading || data.state !== "valid",
    [data.state, loading]
  );

  const handleRedeem = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/coupons/redeem/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffName: staffName.trim(),
          storeName: storeName.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as RedeemResponse & { error?: string };
      if (!res.ok) {
        setError(json.error || "Failed to redeem coupon.");
        return;
      }
      setData(json);
    } catch {
      setError("Failed to redeem coupon.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const couponStatus = data.coupon?.status;
    const shouldSyncHistory =
      Boolean(data.coupon) &&
      (couponStatus === "redeemed" || couponStatus === "expired" || data.state === "already_redeemed" || data.state === "expired");

    if (!shouldSyncHistory) return;

    try {
      const raw = window.localStorage.getItem(LOCAL_WALLET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const nextCoupons = parsed.map((coupon) => {
            if (!coupon || coupon.redeemToken !== token) return coupon;
            return {
              ...coupon,
              status: couponStatus === "expired" || data.state === "expired" ? "expired" : "redeemed",
              state: data.state === "expired" ? "expired" : "already_redeemed",
              redeemedAt: data.coupon?.redeemedAt || new Date().toISOString(),
              redeemedStaffName: data.coupon?.redeemedStaffName || null,
              redeemedStoreName: data.coupon?.redeemedStoreName || null,
            };
          });
          window.localStorage.setItem(LOCAL_WALLET_STORAGE_KEY, JSON.stringify(nextCoupons));
        }
      }
    } catch {
      // Ignore local wallet sync failures and continue to the wallet page.
    }

    if (!data.redeemedNow) return;

    const timer = window.setTimeout(() => {
      window.location.href = "/wallet?tab=history";
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    data.coupon,
    data.coupon?.redeemedAt,
    data.coupon?.redeemedStaffName,
    data.coupon?.redeemedStoreName,
    data.coupon?.status,
    data.redeemedNow,
    data.state,
    token,
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-5">
      <div className="mx-auto w-full max-w-md">
        <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white/95 p-5 shadow-[0_20px_48px_rgba(150,9,83,0.2)]">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Staff Redeem</p>
          <h1 className="mt-1 font-display text-[2rem] leading-none text-[var(--yl-ink-strong)]">Coupon Check</h1>
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-center text-lg font-black ${stateClasses(data.state)}`}>
            {stateLabel(data.state)}
          </div>

          {data.coupon ? (
            <div className="mt-4 rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] p-4">
              <p className="text-lg font-black text-[var(--yl-ink-strong)]">{data.coupon.title}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">{data.coupon.description}</p>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">Offer</p>
              <p className="text-sm font-bold text-[var(--yl-ink-strong)]">
                Present this screen at the counter. One-time use only.
              </p>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">Expires</p>
              <p className="text-sm font-bold text-[var(--yl-ink-strong)]">{formatCouponExpiry(data.coupon.expiresAt)}</p>
              {data.coupon.redeemedAt ? (
                <>
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">Redeemed</p>
                  <p className="text-sm font-bold text-[var(--yl-ink-strong)]">
                    {new Date(data.coupon.redeemedAt).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
                    {data.coupon.redeemedStoreName ? `Store: ${data.coupon.redeemedStoreName}` : ""}
                    {data.coupon.redeemedStoreName && data.coupon.redeemedStaffName ? " · " : ""}
                    {data.coupon.redeemedStaffName ? `Staff: ${data.coupon.redeemedStaffName}` : ""}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          {data.state === "valid" ? (
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="store-name" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">
                  Store Name
                </label>
                <input
                  id="store-name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Yogurtland Torrance"
                  className="mt-2 w-full rounded-xl border border-[var(--yl-card-border)] bg-white px-3 py-2.5 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                />
              </div>
              <div>
                <label htmlFor="staff-name" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">
                  Staff Name
                </label>
                <input
                  id="staff-name"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Jamie"
                  className="mt-2 w-full rounded-xl border border-[var(--yl-card-border)] bg-white px-3 py-2.5 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                />
              </div>
              <button
                type="button"
                onClick={handleRedeem}
                disabled={redeemDisabled}
                className="w-full rounded-xl bg-[var(--yl-primary)] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {loading ? "Redeeming..." : "Redeem Coupon"}
              </button>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm font-bold text-[var(--yl-primary-soft)]">{error}</p> : null}
          {data.redeemedNow ? (
            <p className="mt-3 text-sm font-bold text-[#3f6b13]">
              Coupon redeemed successfully. Moving this reward to your history...
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

