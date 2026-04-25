"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { formatCouponExpiry, type WalletCoupon } from "../lib/coupons";

type WalletResponse = {
  nickname?: string;
  coupons?: WalletCoupon[];
  activeCoupons?: WalletCoupon[];
  historyCoupons?: WalletCoupon[];
  error?: string;
};

type WalletTab = "active" | "history";

function statusCopy(status: WalletCoupon["status"]) {
  if (status === "redeemed") return "Redeemed";
  if (status === "expired") return "Expired";
  return "Ready to Use";
}

function statusClasses(status: WalletCoupon["status"]) {
  if (status === "redeemed") return "bg-[#f3ecff] text-[#6b21a8]";
  if (status === "expired") return "bg-[#fff1e8] text-[#9a3412]";
  return "bg-[#eff9ea] text-[#2f6c1a]";
}

const QR_DISPLAY_SECONDS = 20;

function CouponCard({ coupon, showQr }: { coupon: WalletCoupon; showQr: boolean }) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const [qrOpen, setQrOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!showQr || !qrOpen) {
      setQrSrc("");
      return;
    }
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
  }, [coupon.redeemToken, showQr, qrOpen]);

  useEffect(() => {
    if (!qrOpen) return;
    setSecondsLeft(QR_DISPLAY_SECONDS);
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setQrOpen(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrOpen]);

  return (
    <article className="animate-card-entrance overflow-hidden rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
      <div className="bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">
            {coupon.status === "active" ? "Active Coupon" : "Coupon History"}
          </p>
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusClasses(coupon.status)}`}>
            {statusCopy(coupon.status)}
          </span>
        </div>
        <h2 className="mt-1 text-2xl font-black text-[var(--yl-ink-strong)]">{coupon.title}</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">{coupon.description}</p>
      </div>

      <div className="grid gap-4 px-5 py-5">
        <div className="rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Expires</p>
          <p className="mt-1 text-lg font-black text-[var(--yl-ink-strong)]">{formatCouponExpiry(coupon.expiresAt)}</p>
        </div>

        {showQr ? (
          qrOpen ? (
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
                Scan in store to validate and redeem this reward.
              </p>
              <p className="mt-1 text-xs font-black text-[var(--yl-primary)]">
                {secondsLeft}초 후 닫힘
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="w-full rounded-[1.5rem] border border-dashed border-[var(--yl-card-border)] bg-[#fff8fb] px-4 py-6 text-center text-sm font-black text-[var(--yl-primary)] transition hover:bg-[#fff0f7]"
            >
              탭하여 QR 코드 보기
            </button>
          )
        ) : (
          <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-4 py-4 text-sm font-semibold text-[var(--yl-ink-muted)]">
            {coupon.status === "redeemed" ? (
              <>
                Redeemed {coupon.redeemedAt ? new Date(coupon.redeemedAt).toLocaleString() : ""}.
                {coupon.redeemedStoreName ? ` Store: ${coupon.redeemedStoreName}.` : ""}
                {coupon.redeemedStaffName ? ` Staff: ${coupon.redeemedStaffName}.` : ""}
              </>
            ) : (
              "This reward has expired and is no longer available to redeem."
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default function WalletPageClient() {
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [activeCoupons, setActiveCoupons] = useState<WalletCoupon[]>([]);
  const [historyCoupons, setHistoryCoupons] = useState<WalletCoupon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletTab>("active");

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
          setActiveCoupons([]);
          setHistoryCoupons([]);
          return;
        }

        setNickname(String(json.nickname || "").trim());
        const nextActive = Array.isArray(json.activeCoupons) ? json.activeCoupons : [];
        const nextHistory = Array.isArray(json.historyCoupons) ? json.historyCoupons : [];
        setActiveCoupons(nextActive);
        setHistoryCoupons(nextHistory);
        setTab(nextActive.length > 0 ? "active" : "history");
        setError(null);
      } catch {
        if (!active) return;
        setError("Failed to load wallet.");
        setActiveCoupons([]);
        setHistoryCoupons([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const visibleCoupons = useMemo(
    () => (tab === "active" ? activeCoupons : historyCoupons),
    [activeCoupons, historyCoupons, tab]
  );

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
            {nickname ? `${nickname}, your Yogurtland rewards are ready.` : "Your Yogurtland rewards live here."}
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
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-[1.6rem] border border-[var(--yl-card-border)] bg-white/90 p-2 shadow-[0_18px_44px_rgba(150,9,83,0.12)]">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={`rounded-[1rem] px-4 py-3 text-sm font-black ${tab === "active" ? "bg-[var(--yl-primary)] text-white" : "bg-[var(--yl-card-bg)] text-[var(--yl-ink-strong)]"}`}
              >
                Active ({activeCoupons.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className={`rounded-[1rem] px-4 py-3 text-sm font-black ${tab === "history" ? "bg-[var(--yl-primary)] text-white" : "bg-[var(--yl-card-bg)] text-[var(--yl-ink-strong)]"}`}
              >
                History ({historyCoupons.length})
              </button>
            </div>

            {visibleCoupons.length === 0 ? (
          <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-8 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
            <p className="text-lg font-black text-[var(--yl-ink-strong)]">
              {tab === "active" ? "No active coupons yet" : "No coupon history yet"}
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
              {tab === "active"
                ? "Finish a run and score at least 10 to unlock your first reward."
                : "Redeemed and expired rewards will appear here after use."}
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
            {visibleCoupons.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} showQr={tab === "active"} />
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </main>
  );
}
