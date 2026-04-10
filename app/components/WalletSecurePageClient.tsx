"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

import {
  formatCouponExpiry,
  formatCouponLabel,
  getCouponFixedQrValue,
  getCouponRewardByPercent,
  getWalletCouponStatus,
  type WalletCoupon,
} from "../lib/coupons";

const LOCAL_WALLET_STORAGE_KEY = "walletCouponsLocal";
const WALLET_REFRESH_INTERVAL_MS = 10000;
const QR_LOADING_MS = 2500;
const QR_ACTIVE_MS = 15000;

type WalletResponse = {
  nickname?: string;
  coupons?: WalletCoupon[];
  activeCoupons?: WalletCoupon[];
  historyCoupons?: WalletCoupon[];
  error?: string;
};

type WalletTab = "active" | "history";
type WalletUiState = "idle" | "loading" | "active" | "expired";

type RedeemLookupResponse = {
  state?: "valid" | "already_redeemed" | "expired" | "invalid";
  coupon?: {
    status?: "active" | "redeemed" | "expired";
    redeemedAt?: string | null;
    redeemedStaffName?: string | null;
    redeemedStoreName?: string | null;
  } | null;
};

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

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function inferDiscountPercent(coupon: WalletCoupon) {
  const candidates = [coupon.title, coupon.description];
  for (const text of candidates) {
    const match = String(text || "").match(/\b(3|5|10|15)\s*%/);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function resolveCouponLabel(coupon: WalletCoupon) {
  const directLabel = formatCouponLabel(coupon.rewardType);
  if (directLabel !== "Coupon") return directLabel;

  const inferredPercent = inferDiscountPercent(coupon);
  if (inferredPercent) return `${inferredPercent}%`;

  if (/discount/i.test(coupon.title || "") || /discount/i.test(coupon.description || "")) {
    return "3%";
  }

  return coupon.title?.trim() || "Coupon";
}

function resolveCouponQrValue(coupon: WalletCoupon) {
  const directQrValue = getCouponFixedQrValue(coupon.rewardType);
  if (directQrValue) return directQrValue;

  const inferredPercent = inferDiscountPercent(coupon);
  if (inferredPercent) {
    return getCouponRewardByPercent(inferredPercent)?.fixedQrValue ?? null;
  }

  if (/discount/i.test(coupon.title || "") || /discount/i.test(coupon.description || "")) {
    return getCouponRewardByPercent(3)?.fixedQrValue ?? null;
  }

  return null;
}

async function reconcileActiveCoupons(activeCoupons: WalletCoupon[]) {
  if (activeCoupons.length === 0) {
    return { activeCoupons, historyCoupons: [] as WalletCoupon[] };
  }

  const checked = await Promise.all(
    activeCoupons.map(async (coupon) => {
      try {
        const res = await fetch(`/api/coupons/redeem/${coupon.redeemToken}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as RedeemLookupResponse;
        const nextStatus =
          json.coupon?.status === "redeemed" || json.state === "already_redeemed"
            ? "redeemed"
            : json.coupon?.status === "expired" || json.state === "expired"
              ? "expired"
              : "active";

        if (nextStatus === "active") {
          return coupon;
        }

        return {
          ...coupon,
          status: nextStatus,
          state: nextStatus === "expired" ? "expired" : "already_redeemed",
          redeemedAt: json.coupon?.redeemedAt || coupon.redeemedAt || null,
          redeemedStaffName: json.coupon?.redeemedStaffName || coupon.redeemedStaffName || null,
          redeemedStoreName: json.coupon?.redeemedStoreName || coupon.redeemedStoreName || null,
        } satisfies WalletCoupon;
      } catch {
        return coupon;
      }
    })
  );

  return {
    activeCoupons: checked.filter((coupon) => coupon.status === "active"),
    historyCoupons: checked.filter((coupon) => coupon.status !== "active"),
  };
}

function HistoryCard({ coupon }: { coupon: WalletCoupon }) {
  const statusLabel = coupon.status === "redeemed" ? "Redeemed" : "Expired";
  const statusClass =
    coupon.status === "redeemed" ? "bg-[#f3ecff] text-[#6b21a8]" : "bg-[#fff1e8] text-[#9a3412]";

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white shadow-[0_14px_32px_rgba(150,9,83,0.14)]">
      <div className="bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Coupon History</p>
            <h2 className="mt-2 text-xl font-black text-[var(--yl-ink-strong)]">{resolveCouponLabel(coupon)} Discount</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 text-sm font-semibold text-[var(--yl-ink-muted)]">
        <div className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Original Value</p>
          <p className="mt-1 text-base font-black text-[var(--yl-ink-strong)]">{resolveCouponLabel(coupon)}</p>
        </div>
        <div className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-3">
          {coupon.status === "redeemed" ? (
            <>
              Redeemed {coupon.redeemedAt ? new Date(coupon.redeemedAt).toLocaleString() : ""}.
              {coupon.redeemedStoreName ? ` Store: ${coupon.redeemedStoreName}.` : ""}
              {coupon.redeemedStaffName ? ` Staff: ${coupon.redeemedStaffName}.` : ""}
            </>
          ) : (
            <>Expired after secure QR generation. Original wallet expiry: {formatCouponExpiry(coupon.expiresAt)}.</>
          )}
        </div>
      </div>
    </article>
  );
}

export default function WalletSecurePageClient({ initialTab }: { initialTab?: string }) {
  const requestedTab: WalletTab = initialTab === "history" ? "history" : "active";
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [activeCoupons, setActiveCoupons] = useState<WalletCoupon[]>([]);
  const [historyCoupons, setHistoryCoupons] = useState<WalletCoupon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletTab>(requestedTab);
  const [walletUiStates, setWalletUiStates] = useState<Record<number, WalletUiState>>({});
  const [activeCouponId, setActiveCouponId] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_ACTIVE_MS / 1000);
  const [currentTime, setCurrentTime] = useState(formatClock(new Date()));
  const [qrDataUrl, setQrDataUrl] = useState("");

  const activeCouponsRef = useRef<WalletCoupon[]>([]);
  const historyCouponsRef = useRef<WalletCoupon[]>([]);
  const generationTimeoutRef = useRef<number | null>(null);
  const countdownTimeoutRef = useRef<number | null>(null);
  const clockIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    activeCouponsRef.current = activeCoupons;
  }, [activeCoupons]);

  useEffect(() => {
    historyCouponsRef.current = historyCoupons;
  }, [historyCoupons]);

  const clearQrTimers = () => {
    if (generationTimeoutRef.current) {
      window.clearTimeout(generationTimeoutRef.current);
      generationTimeoutRef.current = null;
    }
    if (countdownTimeoutRef.current) {
      window.clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    if (clockIntervalRef.current) {
      window.clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearQrTimers();
    };
  }, []);

  const activeSessionCoupon = useMemo(
    () => activeCoupons.find((coupon) => coupon.id === activeCouponId) ?? null,
    [activeCouponId, activeCoupons]
  );

  useEffect(() => {
    const qrValue = activeSessionCoupon ? resolveCouponQrValue(activeSessionCoupon) : null;
    if (!activeSessionCoupon || !qrValue) {
      setQrDataUrl("");
      return;
    }

    void QRCode.toDataURL(qrValue, {
      margin: 1,
      width: 220,
      color: {
        dark: "#4b0b31",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [activeSessionCoupon]);

  useEffect(() => {
    let active = true;

    const loadWallet = async () => {
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
            const reconciled = await reconcileActiveCoupons(localActive);
            const nextActive = reconciled.activeCoupons;
            const nextHistory = [...localHistory, ...reconciled.historyCoupons].sort(
              (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
            );
            setNickname(nickname || "");
            setActiveCoupons(nextActive);
            setHistoryCoupons(nextHistory);
            writeLocalWalletCoupons([...nextActive, ...nextHistory]);
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
        const reconciled = await reconcileActiveCoupons([
          ...serverActive,
          ...mergedLocal.filter((coupon) => coupon.status === "active"),
        ]);
        const nextHistory = [...serverHistory, ...mergedLocal.filter((coupon) => coupon.status !== "active"), ...reconciled.historyCoupons].sort(
          (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
        );

        setActiveCoupons(reconciled.activeCoupons);
        setHistoryCoupons(nextHistory);
        writeLocalWalletCoupons([...reconciled.activeCoupons, ...nextHistory]);
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

    void loadWallet();

    const intervalId = window.setInterval(() => {
      void loadWallet();
    }, WALLET_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const walletSummary = useMemo(
    () => ({
      available: activeCoupons.length,
      redeemed: historyCoupons.filter((coupon) => coupon.status === "redeemed").length,
      expired: historyCoupons.filter((coupon) => coupon.status === "expired").length,
    }),
    [activeCoupons, historyCoupons]
  );

  const expireCoupon = async (coupon: WalletCoupon) => {
    clearQrTimers();
    setWalletUiStates((prev) => ({ ...prev, [coupon.id]: "expired" }));
    setActiveCouponId(null);
    setSecondsLeft(0);
    setQrDataUrl("");

    const expiredCoupon: WalletCoupon = {
      ...coupon,
      status: "expired",
      state: "expired",
    };

    const nextActive = activeCouponsRef.current.filter((item) => item.id !== coupon.id);
    const nextHistory = [expiredCoupon, ...historyCouponsRef.current.filter((item) => item.id !== coupon.id)].sort(
      (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
    );

    setActiveCoupons(nextActive);
    setHistoryCoupons(nextHistory);
    writeLocalWalletCoupons([...nextActive, ...nextHistory]);

    try {
      await fetch("/api/coupons/wallet/expire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId: coupon.id }),
      });
    } catch {
      // Keep the coupon locked locally even if the sync call fails.
    }
  };

  const startCouponFlow = (coupon: WalletCoupon) => {
    const qrValue = resolveCouponQrValue(coupon);
    if (!qrValue) return;

    clearQrTimers();
    setTab("active");
    setQrDataUrl("");
    setCurrentTime(formatClock(new Date()));
    setSecondsLeft(QR_ACTIVE_MS / 1000);
    setActiveCouponId(coupon.id);
    setWalletUiStates((prev) => ({ ...prev, [coupon.id]: "loading" }));

    generationTimeoutRef.current = window.setTimeout(() => {
      setWalletUiStates((prev) => ({ ...prev, [coupon.id]: "active" }));
      setCurrentTime(formatClock(new Date()));
      setSecondsLeft(QR_ACTIVE_MS / 1000);

      clockIntervalRef.current = window.setInterval(() => {
        setCurrentTime(formatClock(new Date()));
        setSecondsLeft((prev) => Math.max(prev - 1, 0));
      }, 1000);

      countdownTimeoutRef.current = window.setTimeout(() => {
        void expireCoupon(coupon);
      }, QR_ACTIVE_MS);
    }, QR_LOADING_MS);
  };

  const activeCards = useMemo(
    () =>
      [...activeCoupons].sort((a, b) => {
        const aValue = Number.parseInt(resolveCouponLabel(a), 10);
        const bValue = Number.parseInt(resolveCouponLabel(b), 10);
        return bValue - aValue;
      }),
    [activeCoupons]
  );

  const historyCards = useMemo(
    () =>
      [...historyCoupons].sort(
        (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
      ),
    [historyCoupons]
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
            {nickname ? `${nickname}, store staff should tap Use to generate a live QR coupon.` : "Store staff should tap Use to generate a live QR coupon."}
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
          </section>
        ) : (
          <>
            <section className="grid grid-cols-3 gap-3">
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Available</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.available}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Redeemed</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.redeemed}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Expired</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.expired}</p>
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

            {tab === "active" && activeCards.length === 0 ? (
              <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-8 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
                <p className="text-lg font-black text-[var(--yl-ink-strong)]">No active coupons yet</p>
                <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
                  Score 30, 50, 100, or 150 in the game to unlock your best available discount coupon.
                </p>
              </section>
            ) : null}

            {tab === "history" && historyCards.length === 0 ? (
              <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-8 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
                <p className="text-lg font-black text-[var(--yl-ink-strong)]">No coupon history yet</p>
                <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
                  Expired and redeemed coupons appear here after use.
                </p>
              </section>
            ) : null}

            {tab === "active" ? (
              <div className="grid gap-4">
                {activeCards.map((coupon) => {
                  const uiState = walletUiStates[coupon.id] ?? "idle";
                  const qrValue = resolveCouponQrValue(coupon);
                  const progress = uiState === "active" ? (secondsLeft / (QR_ACTIVE_MS / 1000)) * 100 : 0;

                  return (
                    <article
                      key={coupon.id}
                      className="overflow-hidden rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white shadow-[0_14px_32px_rgba(150,9,83,0.14)]"
                    >
                      <div className="bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Available Coupon</p>
                            <h2 className="mt-2 text-xl font-black text-[var(--yl-ink-strong)]">{resolveCouponLabel(coupon)} Discount</h2>
                          </div>
                          <span className="rounded-full bg-[#eff9ea] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#2f6c1a]">
                            Available
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-[var(--yl-ink-muted)]">
                          Wallet expiry: {formatCouponExpiry(coupon.expiresAt)}
                        </p>
                      </div>

                      <div className="grid gap-3 px-4 py-4">
                        <button
                          type="button"
                          onClick={() => startCouponFlow(coupon)}
                          disabled={uiState === "loading" || uiState === "active"}
                          className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-3 text-left disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Store Use</p>
                              <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">
                                Staff must tap Use before the QR appears.
                              </p>
                            </div>
                            <span
                              className={`rounded-full bg-[var(--yl-primary)] px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-white ${
                                uiState === "loading" || uiState === "active" ? "opacity-50" : ""
                              }`}
                            >
                              {uiState === "loading" ? "Generating" : uiState === "active" ? "Live" : "Use"}
                            </span>
                          </div>
                        </button>

                        {activeCouponId === coupon.id && uiState === "loading" ? (
                          <div className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-white px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full border-4 border-[var(--yl-primary)] border-t-transparent animate-spin" />
                              <div>
                                <p className="text-sm font-black text-[var(--yl-ink-strong)]">Generating secure coupon...</p>
                                <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">
                                  The QR appears after a short secure loading animation.
                                </p>
                              </div>
                            </div>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f6dde8]">
                              <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--yl-primary)]" />
                            </div>
                          </div>
                        ) : null}

                        {activeCouponId === coupon.id && uiState === "active" ? (
                          <div className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-white px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Live QR</p>
                                <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">
                                  Fixed payload for POS scanning only.
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Time Left</p>
                                <p className="mt-1 text-3xl font-black text-[var(--yl-ink-strong)]">{secondsLeft}s</p>
                              </div>
                            </div>

                            <div className="mt-4 flex justify-center">
                              {qrDataUrl ? (
                                <img
                                  src={qrDataUrl}
                                  alt={`${resolveCouponLabel(coupon)} coupon QR`}
                                  className="h-56 w-56 rounded-2xl border border-[var(--yl-card-border)] bg-white p-3"
                                />
                              ) : (
                                <div className="grid h-56 w-56 place-items-center rounded-2xl border border-[var(--yl-card-border)] bg-[#fff8fb] text-sm font-bold text-[var(--yl-ink-muted)]">
                                  Loading QR...
                                </div>
                              )}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <div className="rounded-[1rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-3">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Current Time</p>
                                <p className="mt-1 text-base font-black text-[var(--yl-ink-strong)]">{currentTime}</p>
                              </div>
                              <div className="rounded-[1rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-3">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">QR Payload</p>
                                <p className="mt-1 break-all font-mono text-xs font-black text-[var(--yl-ink-strong)]">{qrValue}</p>
                              </div>
                            </div>

                            <div className="mt-4">
                              <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">
                                <span>Countdown</span>
                                <span>{secondsLeft}s remaining</span>
                              </div>
                              <div className="h-3 overflow-hidden rounded-full bg-[#f6dde8]">
                                <div
                                  className="h-full rounded-full bg-[linear-gradient(135deg,#960953,#c54b86)] transition-[width] duration-1000"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {tab === "history" ? (
              <div className="grid gap-4">
                {historyCards.map((coupon) => (
                  <HistoryCard key={coupon.id} coupon={coupon} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
