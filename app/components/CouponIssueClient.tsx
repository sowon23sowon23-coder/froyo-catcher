"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { COUPON_SCORE_THRESHOLD, formatCurrency, formatDateTime } from "../lib/couponMvp";

type IssueResponse = {
  eligible?: boolean;
  reason?: string;
  redeemUrl?: string;
  qrPayload?: string;
  coupon?: {
    code: string;
    couponName: string;
    discountAmount: number;
    expiresAt: string;
  };
  error?: string;
};

export default function CouponIssueClient() {
  const [userId, setUserId] = useState("user_123");
  const [score, setScore] = useState("92");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IssueResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const issueCoupon = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/coupons/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim() || null,
          score: Number(score),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as IssueResponse;
      setResult(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!result?.qrPayload) {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(result.qrPayload, {
      width: 220,
      margin: 1,
      color: {
        dark: "#48252b",
        light: "#fffdf8",
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [result?.qrPayload]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fffaf0_0%,#fff0f3_38%,#ffe0d8_100%)] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2rem] border border-[#f6d7d2] bg-white/95 p-6 shadow-[0_28px_60px_rgba(173,95,87,0.18)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f1735d]">Game Reward</p>
          <h1 className="mt-2 text-4xl font-black leading-none text-[#5a2f39]">Coupon Reward Demo</h1>
          <p className="mt-3 text-sm font-semibold text-[#8b5b67]">
            A 3,000 KRW off coupon is issued automatically when the score is {COUPON_SCORE_THRESHOLD} or higher.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-black uppercase tracking-[0.14em] text-[#ba6574]">User ID</label>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#f4d4d6] px-4 py-4 text-lg font-bold text-[#4e2430] outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-[0.14em] text-[#ba6574]">Score</label>
              <input
                value={score}
                onChange={(event) => setScore(event.target.value.replace(/[^\d]/g, ""))}
                className="mt-2 w-full rounded-2xl border border-[#f4d4d6] px-4 py-4 text-lg font-bold text-[#4e2430] outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void issueCoupon()}
            disabled={loading}
            className="mt-5 rounded-2xl bg-[linear-gradient(135deg,#ff9671,#ff5d73)] px-6 py-4 text-lg font-black text-white disabled:opacity-60"
          >
            {loading ? "Issuing..." : "Issue Coupon"}
          </button>

          {result?.error ? (
            <div className="mt-4 rounded-2xl border border-[#f8c4cf] bg-[#fff2f4] px-4 py-3 text-sm font-bold text-[#b8435a]">
              {result.error}
            </div>
          ) : null}

          {result && result.eligible === false ? (
            <div className="mt-4 rounded-2xl border border-[#f5d7a0] bg-[#fff8e8] px-4 py-3 text-sm font-bold text-[#93621f]">
              {result.reason}
            </div>
          ) : null}
        </section>

        <section className="rounded-[2rem] border border-[#f2d8d2] bg-[#fffdf8] p-6 shadow-[0_24px_50px_rgba(173,95,87,0.12)]">
          {result?.coupon ? (
            <>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f1735d]">Issued Coupon</p>
              <h2 className="mt-2 text-3xl font-black text-[#512733]">
                Success! A {formatCurrency(result.coupon.discountAmount)} discount coupon has been issued.
              </h2>
              <div className="mt-5 rounded-[1.75rem] border border-[#f7dfd6] bg-white p-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-2xl font-black text-[#4e2430]">{result.coupon.couponName}</p>
                    <p className="mt-3 text-sm font-semibold text-[#7a4e59]">Expires: {formatDateTime(result.coupon.expiresAt)}</p>
                    <p className="mt-2 text-sm font-semibold text-[#7a4e59]">Code: <span className="font-black">{result.coupon.code}</span></p>
                    {result.redeemUrl ? (
                      <p className="mt-2 break-all text-xs font-bold text-[#b76172]">{result.redeemUrl}</p>
                    ) : null}
                  </div>
                  <div className="rounded-3xl bg-[#fff8f1] p-4">
                    {qrDataUrl ? <img src={qrDataUrl} alt="Coupon QR" className="h-56 w-56" /> : <div className="h-56 w-56 bg-[#fff3ef]" />}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-[1.75rem] border border-dashed border-[#f0d8d0] bg-white/80 p-8 text-center text-sm font-semibold text-[#88606a]">
              Once a coupon is issued, this area will show the coupon name, discount amount, expiration date, QR code, and coupon code.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
