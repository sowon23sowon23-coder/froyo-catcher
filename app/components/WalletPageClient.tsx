"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { formatCouponExpiry, type WalletCoupon } from "../lib/coupons";

const LOCAL_WALLET_STORAGE_KEY = "walletCouponsLocal";
const WALLET_REFRESH_INTERVAL_MS = 10000;
const EXPIRING_SOON_DAYS = 3;

type WalletResponse = {
  nickname?: string;
  coupons?: WalletCoupon[];
  activeCoupons?: WalletCoupon[];
  historyCoupons?: WalletCoupon[];
  error?: string;
};

type WalletTab = "active" | "history";

function readLocalWalletCoupons(): WalletCoupon[] {
  try {
    const raw = localStorage.getItem(LOCAL_WALLET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WalletCoupon[]) : [];
  } catch {
    return [];
  }
}

function writeLocalWalletCoupons(coupons: WalletCoupon[]) {
  try {
    localStorage.setItem(LOCAL_WALLET_STORAGE_KEY, JSON.stringify(coupons));
  } catch {
    // Ignore storage write failures so wallet rendering still works.
  }
}

function getDaysUntilExpiry(expiresAt: string) {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function isExpiringSoon(expiresAt: string) {
  return getDaysUntilExpiry(expiresAt) <= EXPIRING_SOON_DAYS;
}

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

function CouponCard({
  coupon,
  showQr,
  expanded,
  onToggle,
}: {
  coupon: WalletCoupon;
  showQr: boolean;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const daysUntilExpiry = getDaysUntilExpiry(coupon.expiresAt);
  const expiresSoon = coupon.status === "active" && isExpiringSoon(coupon.expiresAt);

  useEffect(() => {
    if (!showQr || !expanded) {
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
  }, [coupon.redeemToken, expanded, showQr]);

  return (
    <article className="animate-card-entrance overflow-hidden rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
      <div className="bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">
            {coupon.status === "active" ? "Active Coupon" : "Coupon History"}
          </p>
          <div className="flex items-center gap-2">
            {expiresSoon ? (
              <span className="rounded-full bg-[#fff1e8] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#9a3412]">
                Expires Soon
              </span>
            ) : null}
            <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusClasses(coupon.status)}`}>
              {statusCopy(coupon.status)}
            </span>
          </div>
        </div>
        <h2 className="mt-1 text-2xl font-black text-[var(--yl-ink-strong)]">{coupon.title}</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">{coupon.description}</p>
      </div>

      <div className="grid gap-4 px-5 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Expires</p>
            <p className="mt-1 text-lg font-black text-[var(--yl-ink-strong)]">{formatCouponExpiry(coupon.expiresAt)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--yl-card-border)] bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">
              {coupon.status === "active" ? "Use By" : "Status"}
            </p>
            <p className="mt-1 text-lg font-black text-[var(--yl-ink-strong)]">
              {coupon.status === "active" ? `${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} left` : statusCopy(coupon.status)}
            </p>
          </div>
        </div>

        {showQr ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--yl-card-border)] bg-white px-4 py-4 text-center">
            <button
              type="button"
              onClick={onToggle}
              className="flex w-full items-center justify-between rounded-2xl border border-[var(--yl-card-border)] bg-[#fffafc] px-4 py-3 text-left"
              aria-expanded={expanded}
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Show QR</p>
                <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">
                  Tap to {expanded ? "hide" : "view"} this coupon's QR code.
                </p>
              </div>
              <span className="text-2xl font-black text-[var(--yl-primary)]">{expanded ? "^" : "+"}</span>
            </button>

            {expanded ? (
              <>
                {qrSrc ? (
                  <img
                    src={qrSrc}
                    alt={`${coupon.title} QR code`}
                    className="mx-auto mt-4 h-52 w-52 rounded-2xl border border-[var(--yl-card-border)] bg-white p-3"
                  />
                ) : (
                  <div className="mx-auto mt-4 grid h-52 w-52 place-items-center rounded-2xl border border-[var(--yl-card-border)] bg-[#fff8fb] text-sm font-bold text-[var(--yl-ink-muted)]">
                    Loading QR...
                  </div>
                )}
                <div className="mt-3 rounded-2xl border border-[var(--yl-card-border)] bg-[#fffafc] px-4 py-3 text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">How to use</p>
                  <p className="mt-2 text-xs font-semibold text-[var(--yl-ink-muted)]">1. Show this QR before payment.</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">2. Ask staff to scan and redeem it at the counter.</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">3. This reward can be used one time only.</p>
                </div>
              </>
            ) : null}
          </div>
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
  const [redeemNotice, setRedeemNotice] = useState<string | null>(null);
  const [expandedCouponToken, setExpandedCouponToken] = useState<string | null>(null);
  const activeCouponsRef = useRef<WalletCoupon[]>([]);
  const tabRef = useRef<WalletTab>("active");
  const notifiedRedeemedTokensRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeCouponsRef.current = activeCoupons;
  }, [activeCoupons]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    if (tab !== "active") {
      setExpandedCouponToken(null);
      return;
    }

    if (expandedCouponToken && !activeCoupons.some((coupon) => coupon.redeemToken === expandedCouponToken)) {
      setExpandedCouponToken(null);
    }
  }, [activeCoupons, expandedCouponToken, tab]);

  useEffect(() => {
    let active = true;

    const loadWallet = async (options?: { initial?: boolean }) => {
      try {
        const nickname = (localStorage.getItem("nickname") || "").trim();
        const contactType = (localStorage.getItem("entryContactType") || "").trim();
        const contactValue = (localStorage.getItem("entryContactValue") || "").trim();
        const params = new URLSearchParams();
        if (nickname) params.set("nickname", nickname);
        if (contactType) params.set("contactType", contactType);
        if (contactValue) params.set("contactValue", contactValue);

        const res = await fetch(`/api/coupons/wallet${params.toString() ? `?${params.toString()}` : ""}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as WalletResponse;
        const localCoupons = readLocalWalletCoupons();

        if (!active) return;

        if (!res.ok) {
          const localActive = localCoupons.filter((coupon) => coupon.status === "active");
          const localHistory = localCoupons.filter((coupon) => coupon.status !== "active");
          if (localCoupons.length > 0) {
            setNickname(nickname || "");
            setActiveCoupons(localActive);
            setHistoryCoupons(localHistory);
            if (options?.initial) {
              setTab(localActive.length > 0 ? "active" : "history");
            } else if (tabRef.current === "active" && localActive.length === 0 && localHistory.length > 0) {
              setTab("history");
            }
            setError(null);
            return;
          }
          setError(json.error || (res.status === 401 ? "Please log in to open your wallet." : "Failed to load wallet."));
          setActiveCoupons([]);
          setHistoryCoupons([]);
          return;
        }

        setNickname(String(json.nickname || "").trim());
        const serverActive = Array.isArray(json.activeCoupons) ? json.activeCoupons : [];
        const serverHistory = Array.isArray(json.historyCoupons) ? json.historyCoupons : [];
        const mergedLocal = localCoupons.filter(
          (coupon) =>
            !serverActive.some((serverCoupon) => serverCoupon.redeemToken === coupon.redeemToken) &&
            !serverHistory.some((serverCoupon) => serverCoupon.redeemToken === coupon.redeemToken)
        );
        const nextActive = [...serverActive, ...mergedLocal.filter((coupon) => coupon.status === "active")];
        const nextHistory = [...serverHistory, ...mergedLocal.filter((coupon) => coupon.status !== "active")];
        const previousActiveTokens = new Set(activeCouponsRef.current.map((coupon) => coupon.redeemToken));
        const movedToHistory = nextHistory.some((coupon) => previousActiveTokens.has(coupon.redeemToken));
        const newlyRedeemedCoupon = nextHistory.find(
          (coupon) =>
            previousActiveTokens.has(coupon.redeemToken) &&
            coupon.status === "redeemed" &&
            !notifiedRedeemedTokensRef.current.has(coupon.redeemToken)
        );

        setActiveCoupons(nextActive);
        setHistoryCoupons(nextHistory);
        writeLocalWalletCoupons([...nextActive, ...nextHistory]);
        if (newlyRedeemedCoupon) {
          notifiedRedeemedTokensRef.current.add(newlyRedeemedCoupon.redeemToken);
          setRedeemNotice(
            `Redeemed: ${newlyRedeemedCoupon.title}${
              newlyRedeemedCoupon.redeemedStoreName ? ` at ${newlyRedeemedCoupon.redeemedStoreName}` : ""
            }${newlyRedeemedCoupon.redeemedStaffName ? ` by ${newlyRedeemedCoupon.redeemedStaffName}` : ""}.`
          );
        }
        if (options?.initial) {
          setTab(nextActive.length > 0 ? "active" : "history");
        } else if (movedToHistory && tabRef.current === "active") {
          setTab("history");
        } else if (tabRef.current === "active" && nextActive.length === 0 && nextHistory.length > 0) {
          setTab("history");
        }
        setError(null);
      } catch {
        if (!active) return;
        setError("Failed to load wallet.");
        setActiveCoupons([]);
        setHistoryCoupons([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadWallet({ initial: true });

    const intervalId = window.setInterval(() => {
      void loadWallet();
    }, WALLET_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadWallet();
      }
    };

    const handleFocus = () => {
      void loadWallet();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!redeemNotice) return;
    const timeoutId = window.setTimeout(() => setRedeemNotice(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [redeemNotice]);

  const sortedActiveCoupons = useMemo(
    () =>
      [...activeCoupons].sort((a, b) => {
        const aSoon = isExpiringSoon(a.expiresAt) ? 0 : 1;
        const bSoon = isExpiringSoon(b.expiresAt) ? 0 : 1;
        if (aSoon !== bSoon) return aSoon - bSoon;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }),
    [activeCoupons]
  );

  const sortedHistoryCoupons = useMemo(
    () =>
      [...historyCoupons].sort((a, b) => {
        const aTime = new Date(a.redeemedAt || a.expiresAt).getTime();
        const bTime = new Date(b.redeemedAt || b.expiresAt).getTime();
        return bTime - aTime;
      }),
    [historyCoupons]
  );

  const walletSummary = useMemo(
    () => ({
      active: activeCoupons.length,
      redeemed: historyCoupons.filter((coupon) => coupon.status === "redeemed").length,
      expiringSoon: activeCoupons.filter((coupon) => isExpiringSoon(coupon.expiresAt)).length,
    }),
    [activeCoupons, historyCoupons]
  );

  const visibleCoupons = useMemo(
    () => (tab === "active" ? sortedActiveCoupons : sortedHistoryCoupons),
    [sortedActiveCoupons, sortedHistoryCoupons, tab]
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

        {redeemNotice ? (
          <section className="rounded-[1.6rem] border border-[#cfe7c4] bg-[#f4ffef] px-5 py-4 shadow-[0_14px_30px_rgba(71,128,52,0.12)]">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#4d7e32]">Updated</p>
            <p className="mt-1 text-sm font-bold text-[#2f5a19]">{redeemNotice}</p>
          </section>
        ) : null}

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
            <section className="grid grid-cols-3 gap-3">
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Active</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.active}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Redeemed</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.redeemed}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Soon</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.expiringSoon}</p>
              </div>
            </section>

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
                {tab === "active" ? (
                  <Link
                    href="/"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--yl-primary)] px-4 py-3 text-sm font-black text-white"
                  >
                    Play Again
                  </Link>
                ) : null}
              </section>
            ) : (
              <div className="grid gap-4">
                {visibleCoupons.map((coupon) => (
                  <CouponCard
                    key={coupon.id}
                    coupon={coupon}
                    showQr={tab === "active"}
                    expanded={tab === "active" && expandedCouponToken === coupon.redeemToken}
                    onToggle={
                      tab === "active"
                        ? () =>
                            setExpandedCouponToken((current) =>
                              current === coupon.redeemToken ? null : coupon.redeemToken
                            )
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
