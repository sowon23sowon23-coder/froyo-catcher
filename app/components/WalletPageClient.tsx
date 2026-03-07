"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatCouponExpiry, type WalletCoupon } from "../lib/coupons";

type WalletResponse = {
  nickname?: string;
  coupons?: WalletCoupon[];
  error?: string;
};

function CouponCard({ coupon }: { coupon: WalletCoupon }) {
  const [qrSrc, setQrSrc] = useState<string>("");

  useEffect(() => {
    let active = true;
    const redeemUrl = `${window.location.origin}/redeem/${coupon.redeemToken}`;

    void QRCode.toDataURL(redeemUrl, {
      margin: 1,
      width: 220,
      color: {
        dark: "#4b0b31",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (active) setQrSrc(dataUrl);
      })
      .catch(() => {
        if (active) setQrSrc("");
      });

    return () => {
      active = false;
    };
  }, [coupon.redeemToken]);

  return (
    <article className="animate-card-entrance overflow-hidden rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
      <div className="bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)] px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Active Coupon</p>
        <h2 className="mt-1 text-2xl font-black text-[var(--yl-ink-strong)]">{coupon.title}</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">{coupon.description}</p>
      </div>

      <div className="grid gap-4 px-5 py-5">
        <div className="rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Expires</p>
          <p className="mt-1 text-lg font-black text-[var(--yl-ink-strong)]">{formatCouponExpiry(coupon.expiresAt)}</p>
        </div>

        <div className="rounded-[1.5rem] border border-dashed border-[var(--yl-card-border)] bg-white px-4 py-4 text-center">
          {qrSrc ? (
            <img
              src={qrSrc}
              alt={`${coupon.title} QR code`}
              className="mx-auto h-52 w-52 rounded-2xl border border-[var(--yl-card-border)] bg-white p-3"
            />
          ) : (
            <div className="mx-auto grid h-52 w-52 place-items-center rounded-2xl border border-[var(--yl-card-border)] bg-[#fff8fb] text-sm font-bold text-[var(--yl-ink-muted)]">
              Loading QR...
            </div>
          )}
          <p className="mt-3 text-xs font-semibold text-[var(--yl-ink-muted)]">
            Staff can scan this QR to validate and redeem your coupon.
          </p>
        </div>
      </div>
    </article>
  );
}

export default function WalletPageClient() {
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [coupons, setCoupons] = useState<WalletCoupon[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const res = await fetch("/api/coupons/wallet", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as WalletResponse;

        if (!active) return;

        if (!res.ok) {
          setError(json.error || (res.status === 401 ? "Please log in to open your wallet." : "Failed to load wallet."));
          setCoupons([]);
          return;
        }

        setNickname(String(json.nickname || "").trim());
        setCoupons(Array.isArray(json.coupons) ? json.coupons : []);
        setError(null);
      } catch {
        if (!active) return;
        setError("Failed to load wallet.");
        setCoupons([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-5">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white/90 px-5 py-5 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Digital Wallet</p>
              <h1 className="font-display text-[2rem] leading-none text-[var(--yl-ink-strong)]">My Wallet</h1>
            </div>
            <Link
              href="/"
              className="rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--yl-primary)]"
            >
              Home
            </Link>
          </div>
          <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
            {nickname ? `${nickname}, here are your active promo rewards.` : "Your active promo rewards live here."}
          </p>
        </header>

        {loading ? (
          <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-10 text-center text-sm font-bold text-[var(--yl-ink-muted)] shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
            Loading wallet...
          </section>
        ) : error ? (
          <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-8 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
            <p className="text-lg font-black text-[var(--yl-ink-strong)]">Wallet unavailable</p>
            <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">{error}</p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-xl bg-[var(--yl-primary)] px-4 py-3 text-sm font-black text-white"
            >
              Back to game
            </Link>
          </section>
        ) : coupons.length === 0 ? (
          <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-8 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
            <p className="text-lg font-black text-[var(--yl-ink-strong)]">No active coupons yet</p>
            <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
              Finish a run and score at least 10 to unlock your first reward.
            </p>
            <div className="mt-4 rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] p-4 text-sm font-semibold text-[var(--yl-ink-muted)]">
              Score 10+: Free Topping
              <br />
              Score 180+: $1 Off
              <br />
              Score 250+: BOGO
            </div>
          </section>
        ) : (
          <div className="grid gap-4">
            {coupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
