"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatCurrency, formatDateTime } from "../lib/couponMvp";

type SessionInfo = {
  staffId: string;
  staffName: string;
  storeId: string;
  storeName: string;
};

type CouponSummary = {
  id: number;
  code: string;
  couponName: string;
  discountAmount: number;
  status: "unused" | "used" | "expired" | "invalid";
  reason: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedStoreId: string | null;
  redeemedStaffId: string | null;
  orderNumber: string | null;
};

type ValidateResult = {
  valid?: boolean;
  status?: CouponSummary["status"];
  reason?: string;
  coupon?: CouponSummary | null;
  error?: string;
};

type RedeemResult = {
  success?: boolean;
  reason?: string;
  coupon?: CouponSummary | null;
  error?: string;
};

function statusStyle(status?: CouponSummary["status"]) {
  if (status === "unused") return "border-[#bde7c1] bg-[#eefbf0] text-[#1f6f35]";
  if (status === "used") return "border-[#d9d9df] bg-[#f3f4f6] text-[#55586b]";
  if (status === "expired") return "border-[#ffd29d] bg-[#fff5e8] text-[#a45707]";
  return "border-[#f6b7bf] bg-[#fff1f2] text-[#b62b45]";
}

export default function RedeemConsoleClient({
  session,
  initialCode,
}: {
  session: SessionInfo;
  initialCode?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [code, setCode] = useState(initialCode || "");
  const [orderNumber, setOrderNumber] = useState("");
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const normalizedCode = useMemo(() => code.toUpperCase().replace(/[^A-Z0-9]/g, ""), [code]);

  const validateCoupon = async () => {
    if (!normalizedCode) return;
    setLoading(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const json = (await res.json().catch(() => ({}))) as ValidateResult;
      setValidateResult(json);
      setToast(json.reason || json.error || null);
    } finally {
      setLoading(false);
    }
  };

  const redeemCoupon = async () => {
    if (!normalizedCode) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          storeId: session.storeId,
          staffId: session.staffId,
          orderNumber: orderNumber.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as RedeemResult;
      setToast(json.reason || json.error || null);
      if (json.coupon) {
        setValidateResult({
          valid: false,
          status: json.coupon.status,
          reason: json.reason,
          coupon: json.coupon,
        });
      }
    } finally {
      setRedeeming(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login?next=/redeem";
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!initialCode) return;
    void validateCoupon();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <main className="min-h-screen bg-[#fff7f2] px-4 py-5 sm:px-6">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-[#f3cfd4] bg-white px-4 py-3 text-center text-sm font-black text-[#8b4256] shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.8rem] border border-[#f3d7d5] bg-white p-4 shadow-[0_16px_34px_rgba(163,100,84,0.12)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f16e59]">Store Redeem Console</p>
            <h1 className="text-3xl font-black text-[#4f2831]">{session.storeName}</h1>
            <p className="text-sm font-semibold text-[#855562]">{session.staffName} / {session.staffId}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-2xl border border-[#edd4cf] px-4 py-3 text-sm font-black text-[#744753]"
          >
            Log Out
          </button>
        </div>

        <section className="rounded-[2rem] border border-[#f2d8d1] bg-white p-5 shadow-[0_24px_48px_rgba(163,100,84,0.12)]">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.18em] text-[#cc6d60]">Coupon Code or Scanner Input</label>
              <input
                ref={inputRef}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void validateCoupon();
                }}
                placeholder="YG7A92K3"
                className="mt-2 w-full rounded-[1.6rem] border border-[#efdad8] px-5 py-5 text-3xl font-black uppercase tracking-[0.08em] text-[#47252c] outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void validateCoupon()}
              disabled={loading || !normalizedCode}
              className="rounded-[1.6rem] bg-[linear-gradient(135deg,#ff9975,#ff6677)] px-4 py-5 text-2xl font-black text-white disabled:opacity-60"
            >
              {loading ? "Checking..." : "Validate"}
            </button>
          </div>

          <div className={`mt-5 rounded-[1.6rem] border px-5 py-4 text-center text-2xl font-black ${statusStyle(validateResult?.status)}`}>
            {validateResult?.status === "unused"
              ? "Valid"
              : validateResult?.status === "used"
                ? "Already Used"
                : validateResult?.status === "expired"
                  ? "Expired"
                  : validateResult?.status === "invalid"
                    ? "Not Found"
                    : "Enter a code and validate it"}
          </div>

          {validateResult?.coupon ? (
            <div className="mt-5 rounded-[1.6rem] border border-[#f0ddda] bg-[#fffdfa] p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c5656b]">Coupon Name</p>
                  <p className="mt-1 text-2xl font-black text-[#4d262f]">{validateResult.coupon.couponName}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c5656b]">Discount Amount</p>
                  <p className="mt-1 text-2xl font-black text-[#4d262f]">{formatCurrency(validateResult.coupon.discountAmount)}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c5656b]">Expires</p>
                  <p className="mt-1 text-lg font-bold text-[#67414a]">{formatDateTime(validateResult.coupon.expiresAt)}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c5656b]">Coupon Code</p>
                  <p className="mt-1 text-lg font-bold text-[#67414a]">{validateResult.coupon.code}</p>
                </div>
              </div>

              {validateResult.status === "unused" ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_240px]">
                  <input
                    value={orderNumber}
                    onChange={(event) => setOrderNumber(event.target.value)}
                    placeholder="Order number (optional)"
                    className="rounded-[1.4rem] border border-[#efdad8] px-4 py-4 text-lg font-bold text-[#4f2831] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void redeemCoupon()}
                    disabled={redeeming}
                    className="rounded-[1.4rem] bg-[#1e9b58] px-4 py-4 text-2xl font-black text-white disabled:opacity-60"
                  >
                    {redeeming ? "Redeeming..." : "Redeem Coupon"}
                  </button>
                </div>
              ) : null}

              {validateResult.coupon.redeemedAt ? (
                <div className="mt-5 rounded-2xl bg-[#f8f5f3] p-4 text-sm font-bold text-[#6e5258]">
                  Redeemed at: {formatDateTime(validateResult.coupon.redeemedAt)}
                  <br />
                  Store ID: {validateResult.coupon.redeemedStoreId || "-"}
                  <br />
                  Staff ID: {validateResult.coupon.redeemedStaffId || "-"}
                  <br />
                  Order number: {validateResult.coupon.orderNumber || "-"}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
