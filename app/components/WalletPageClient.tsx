"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { type WalletCoupon } from "../lib/coupons";

const LOCAL_WALLET_STORAGE_KEY = "walletCouponsLocal";
const WALLET_REFRESH_INTERVAL_MS = 10000;
const EXPIRING_SOON_MS = 2 * 60 * 60 * 1000;
const QR_DISPLAY_SECONDS = 20;

type WalletResponse = {
  nickname?: string;
  coupons?: WalletCoupon[];
  activeCoupons?: WalletCoupon[];
  historyCoupons?: WalletCoupon[];
  error?: string;
};

type WalletTab = "active" | "history";

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

        if (nextStatus === "active") return coupon;

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
    activeCoupons: checked.filter((c) => c.status === "active"),
    historyCoupons: checked.filter((c) => c.status !== "active"),
  };
}

function getRemainingMs(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatExpiryTime(expiresAt: string): string {
  const date = new Date(expiresAt);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (date.toDateString() === now.toDateString()) return `Expires today at ${timeStr}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Expires tomorrow at ${timeStr}`;
  return `Expires ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${timeStr}`;
}

function isExpiringSoon(expiresAt: string): boolean {
  return getRemainingMs(expiresAt) <= EXPIRING_SOON_MS;
}

function countdownColorClass(ms: number): string {
  if (ms > 4 * 3600 * 1000) return "text-[#2f6c1a]";
  if (ms > 1 * 3600 * 1000) return "text-[#9a5a00]";
  return "text-[#9a3412] animate-pulse";
}

function countdownBgClass(ms: number): string {
  if (ms > 4 * 3600 * 1000) return "bg-[#eff9ea]";
  if (ms > 1 * 3600 * 1000) return "bg-[#fff7ed]";
  return "bg-[#fff1e8]";
}

function isUsedToday(coupon: WalletCoupon): boolean {
  if (coupon.status !== "redeemed" || !coupon.redeemedAt) return false;
  return new Date(coupon.redeemedAt).toDateString() === new Date().toDateString();
}

function getMsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

function CouponCard({
  coupon,
  showQr,
  expanded,
  lockedToday,
  onToggle,
}: {
  coupon: WalletCoupon;
  showQr: boolean;
  expanded: boolean;
  lockedToday?: boolean;
  onToggle?: () => void;
}) {
  const [qrSrc, setQrSrc] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(coupon.expiresAt));
  const [midnightMs, setMidnightMs] = useState(() => getMsUntilMidnight());

  useEffect(() => {
    if (coupon.status !== "active") return;
    const id = window.setInterval(() => setRemainingMs(getRemainingMs(coupon.expiresAt)), 1000);
    return () => clearInterval(id);
  }, [coupon.expiresAt, coupon.status]);

  useEffect(() => {
    if (!lockedToday) return;
    const id = window.setInterval(() => setMidnightMs(getMsUntilMidnight()), 1000);
    return () => clearInterval(id);
  }, [lockedToday]);

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
      color: { dark: "#4b0b31", light: "#ffffff" },
    })
      .then((dataUrl) => { if (active) setQrSrc(dataUrl); })
      .catch(() => { if (active) setQrSrc(""); });
    return () => { active = false; };
  }, [coupon.redeemToken, expanded, showQr]);

  useEffect(() => {
    if (!expanded) return;
    setSecondsLeft(QR_DISPLAY_SECONDS);
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(interval); onToggle?.(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [expanded, onToggle]);

  if (coupon.status !== "active") {
    const isRedeemed = coupon.status === "redeemed";
    return (
      <article
        className={[
          "overflow-hidden rounded-[1.5rem] border shadow-sm",
          isRedeemed ? "border-[#cfe7c4] bg-[#f4ffef]" : "border-[#e2e2e2] bg-[#f5f5f5]",
        ].join(" ")}
      >
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p
              className={[
                "text-[11px] font-black uppercase tracking-[0.16em]",
                isRedeemed ? "text-[#4d7e32]" : "text-[#888]",
              ].join(" ")}
            >
              {isRedeemed ? "Used" : "Expired"}
            </p>
            <span
              className={[
                "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em]",
                isRedeemed ? "bg-[#dcf5d0] text-[#2f6c1a]" : "bg-[#e2e2e2] text-[#888]",
              ].join(" ")}
            >
              {isRedeemed ? "Redeemed" : "Expired"}
            </span>
          </div>
          <h2
            className={[
              "mt-2 text-xl font-black",
              isRedeemed ? "text-[var(--yl-ink-strong)]" : "text-[#aaa] line-through",
            ].join(" ")}
          >
            {coupon.title}
          </h2>
          <div
            className={[
              "mt-3 rounded-[1rem] border bg-white px-3 py-2.5 text-xs font-semibold text-[var(--yl-ink-muted)]",
              isRedeemed ? "border-[#cfe7c4]" : "border-[#e2e2e2]",
            ].join(" ")}
          >
            {isRedeemed ? (
              <>
                Used{" "}
                {coupon.redeemedAt
                  ? new Date(coupon.redeemedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : ""}
                {coupon.redeemedStoreName ? ` · ${coupon.redeemedStoreName}` : ""}
                {coupon.redeemedStaffName ? ` · Staff: ${coupon.redeemedStaffName}` : ""}
              </>
            ) : (
              "This coupon was not used before it expired."
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="animate-card-entrance overflow-hidden rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white shadow-[0_14px_32px_rgba(150,9,83,0.14)]">
      <div className="bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">
            Active Coupon
          </p>
          {lockedToday ? (
            <span className="rounded-full bg-[#e0e7ff] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#3730a3]">
              Saved for Tomorrow
            </span>
          ) : (
            <span className="rounded-full bg-[#eff9ea] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#2f6c1a]">
              Ready to Use
            </span>
          )}
        </div>

        <h2 className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{coupon.title}</h2>

        <div className="mt-3 flex items-center gap-2">
          <div
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5",
              countdownBgClass(remainingMs),
            ].join(" ")}
          >
            <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[var(--yl-ink-muted)]">
              Time left
            </span>
            <span
              className={[
                "font-mono text-sm font-black tabular-nums",
                countdownColorClass(remainingMs),
              ].join(" ")}
            >
              {formatCountdown(remainingMs)}
            </span>
          </div>
        </div>
        <p className="mt-1.5 text-xs font-semibold text-[var(--yl-ink-muted)]">
          {formatExpiryTime(coupon.expiresAt)}
        </p>
      </div>

      <div className="grid gap-3 px-4 py-4">
        {lockedToday ? (
          /* ── Locked state: already used a coupon today ── */
          <div className="rounded-[1.25rem] border border-[#c7d2fe] bg-[#eef2ff] p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl leading-none">🔒</span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#3730a3]">
                  Locked for today
                </p>
                <p className="mt-1 text-xs font-semibold text-[#4338ca]">
                  You've already used a coupon today. This one is saved and will be ready to use after midnight.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[0.9rem] border border-[#c7d2fe] bg-white px-3 py-2.5">
              <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#4338ca]">
                Unlocks in
              </span>
              <span className="font-mono text-sm font-black tabular-nums text-[#3730a3]">
                {formatCountdown(midnightMs)}
              </span>
            </div>
          </div>
        ) : showQr ? (
          /* ── Normal QR state ── */
          <div className="rounded-[1.25rem] border border-dashed border-[var(--yl-card-border)] bg-white p-3 text-center">
            {/* Staff-only banner — always visible */}
            <div className="mb-3 flex items-center gap-2 rounded-[0.9rem] border border-[#fbb6ce] bg-[#fff0f6] px-3 py-2.5">
              <span className="text-base leading-none">🔒</span>
              <div className="text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#9b1239]">
                  Staff scan required
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#9b1239]">
                  This QR code must be scanned by a Yogurtland staff member. Do not scan it yourself.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggle}
              className="flex w-full items-center justify-between rounded-[1rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-2.5 text-left"
              aria-expanded={expanded}
            >
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">
                  Show QR Code
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">
                  {expanded ? "Tap to hide" : "Show at the counter — ask staff to scan"}
                </p>
              </div>
              <span className="text-lg font-black text-[var(--yl-primary)]">
                {expanded ? "▲" : "▼"}
              </span>
            </button>

            {expanded ? (
              <>
                {qrSrc ? (
                  <img
                    src={qrSrc}
                    alt={`${coupon.title} QR code`}
                    className="mx-auto mt-3 h-44 w-44 rounded-2xl border border-[var(--yl-card-border)] bg-white p-2.5"
                  />
                ) : (
                  <div className="mx-auto mt-3 grid h-44 w-44 place-items-center rounded-2xl border border-[var(--yl-card-border)] bg-[#fff8fb] text-sm font-bold text-[var(--yl-ink-muted)]">
                    Loading QR...
                  </div>
                )}
                <p className="mt-2 text-xs font-black text-[var(--yl-primary)]">
                  Closes in {secondsLeft}s
                </p>
                <div className="mt-2 rounded-[1rem] border border-[#fbb6ce] bg-[#fff0f6] px-3 py-2.5 text-left">
                  <p className="text-xs font-black text-[#9b1239]">
                    Show this screen to the staff member at the counter.
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[#9b1239]">
                    Only a staff member can complete the redemption — one-time use only.
                  </p>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!lockedToday && (
          <div className="rounded-[1rem] border border-[#fde8c8] bg-[#fff7ed] px-3 py-2.5 text-xs font-semibold text-[#9a5a00]">
            1 coupon per day — using this coupon means no new coupon can be earned until tomorrow.
          </div>
        )}
      </div>
    </article>
  );
}

export default function WalletPageClient({ initialTab }: { initialTab?: string }) {
  const requestedTab: WalletTab = initialTab === "history" ? "history" : "active";
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [activeCoupons, setActiveCoupons] = useState<WalletCoupon[]>([]);
  const [historyCoupons, setHistoryCoupons] = useState<WalletCoupon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletTab>(requestedTab);
  const [redeemNotice, setRedeemNotice] = useState<string | null>(null);
  const [expandedCouponToken, setExpandedCouponToken] = useState<string | null>(null);
  const activeCouponsRef = useRef<WalletCoupon[]>([]);
  const tabRef = useRef<WalletTab>("active");
  const notifiedRedeemedTokensRef = useRef<Set<string>>(new Set());
  const hasAutoExpandedRef = useRef(false);

  useEffect(() => {
    activeCouponsRef.current = activeCoupons;
  }, [activeCoupons]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    setTab((current) => {
      if (requestedTab === "history" && historyCoupons.length > 0) return "history";
      if (requestedTab === "active" && activeCoupons.length > 0) return "active";
      return current;
    });
  }, [requestedTab, activeCoupons.length, historyCoupons.length]);

  useEffect(() => {
    if (tab !== "active") {
      setExpandedCouponToken(null);
      return;
    }
    if (expandedCouponToken && !activeCoupons.some((c) => c.redeemToken === expandedCouponToken)) {
      setExpandedCouponToken(null);
    }
  }, [activeCoupons, expandedCouponToken, tab]);

  // Auto-expand QR when there is exactly one active coupon and daily limit not yet reached
  useEffect(() => {
    const dailyLimitReached = historyCoupons.some(isUsedToday);
    if (!hasAutoExpandedRef.current && activeCoupons.length === 1 && tab === "active" && !dailyLimitReached) {
      hasAutoExpandedRef.current = true;
      setExpandedCouponToken(activeCoupons[0].redeemToken);
    }
  }, [activeCoupons, historyCoupons, tab]);

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
          const localActive = localCoupons.filter((c) => c.status === "active");
          const localHistory = localCoupons.filter((c) => c.status !== "active");
          if (localCoupons.length > 0) {
            const reconciled = await reconcileActiveCoupons(localActive);
            const nextActive = reconciled.activeCoupons;
            const nextHistory = [...localHistory, ...reconciled.historyCoupons].sort(
              (a, b) =>
                new Date(b.redeemedAt || b.expiresAt).getTime() -
                new Date(a.redeemedAt || a.expiresAt).getTime()
            );
            setNickname(nickname || "");
            setActiveCoupons(nextActive);
            setHistoryCoupons(nextHistory);
            writeLocalWalletCoupons([...nextActive, ...nextHistory]);
            if (options?.initial) {
              if (requestedTab === "history" && nextHistory.length > 0) setTab("history");
              else if (requestedTab === "active" && nextActive.length > 0) setTab("active");
              else setTab(nextActive.length > 0 ? "active" : "history");
            } else if (tabRef.current === "active" && nextActive.length === 0 && nextHistory.length > 0) {
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
          (c) =>
            !serverActive.some((s) => s.redeemToken === c.redeemToken) &&
            !serverHistory.some((s) => s.redeemToken === c.redeemToken)
        );
        const initialActive = [...serverActive, ...mergedLocal.filter((c) => c.status === "active")];
        const initialHistory = [...serverHistory, ...mergedLocal.filter((c) => c.status !== "active")];
        const reconciled = await reconcileActiveCoupons(initialActive);
        const nextActive = reconciled.activeCoupons;
        const nextHistory = [...initialHistory, ...reconciled.historyCoupons].sort(
          (a, b) =>
            new Date(b.redeemedAt || b.expiresAt).getTime() -
            new Date(a.redeemedAt || a.expiresAt).getTime()
        );
        const previousActiveTokens = new Set(activeCouponsRef.current.map((c) => c.redeemToken));
        const movedToHistory = nextHistory.some((c) => previousActiveTokens.has(c.redeemToken));
        const newlyRedeemedCoupon = nextHistory.find(
          (c) =>
            previousActiveTokens.has(c.redeemToken) &&
            c.status === "redeemed" &&
            !notifiedRedeemedTokensRef.current.has(c.redeemToken)
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
          if (requestedTab === "history" && nextHistory.length > 0) setTab("history");
          else if (requestedTab === "active" && nextActive.length > 0) setTab("active");
          else setTab(nextActive.length > 0 ? "active" : "history");
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

    const intervalId = window.setInterval(() => { void loadWallet(); }, WALLET_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadWallet();
    };
    const handleFocus = () => { void loadWallet(); };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestedTab]);

  useEffect(() => {
    if (!redeemNotice) return;
    const id = window.setTimeout(() => setRedeemNotice(null), 5000);
    return () => window.clearTimeout(id);
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
      used: historyCoupons.filter((c) => c.status === "redeemed").length,
      expired: historyCoupons.filter((c) => c.status === "expired").length,
    }),
    [activeCoupons, historyCoupons]
  );

  const usedToday = useMemo(() => historyCoupons.some(isUsedToday), [historyCoupons]);
  const hasEverExpired = useMemo(
    () => historyCoupons.some((c) => c.status === "expired"),
    [historyCoupons]
  );

  const visibleCoupons = useMemo(
    () => (tab === "active" ? sortedActiveCoupons : sortedHistoryCoupons),
    [sortedActiveCoupons, sortedHistoryCoupons, tab]
  );

  function emptyActiveMessage() {
    if (usedToday) {
      return {
        title: "All done for today!",
        body: "You've used today's coupon. Playing again today won't issue a new redeemable coupon — come back tomorrow for your next reward.",
        showPlay: false,
      };
    }
    if (hasEverExpired) {
      return {
        title: "No active coupons",
        body: "Your last coupon expired unused. Play again to earn a new one.",
        showPlay: true,
      };
    }
    return {
      title: "No active coupons yet",
      body: "Score 30 or higher in a game to unlock a discount coupon.",
      showPlay: true,
    };
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-5">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">

        {/* Header */}
        <header className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white/90 px-5 py-5 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">
                Digital Wallet
              </p>
              <h1 className="font-display text-[2rem] leading-none text-[var(--yl-ink-strong)]">
                My Wallet
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--yl-primary)]"
            >
              Home
            </Link>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-[var(--yl-ink-muted)]">
            {nickname ? `${nickname}'s rewards` : "Your Yogurtland rewards"}
          </p>
          <div className="mt-3 flex items-center gap-1.5 rounded-[0.9rem] border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-3 py-2">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">
              24-hour validity
            </span>
            <span className="text-[11px] text-[var(--yl-ink-muted)]">·</span>
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">
              1 coupon per day
            </span>
          </div>
        </header>

        {/* Redeem notice */}
        {redeemNotice ? (
          <section className="rounded-[1.6rem] border border-[#cfe7c4] bg-[#f4ffef] px-5 py-4 shadow-[0_14px_30px_rgba(71,128,52,0.12)]">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#4d7e32]">Redeemed</p>
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
            {/* Stats */}
            <section className="grid grid-cols-3 gap-3">
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Active</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.active}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#4d7e32]">Used</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.used}</p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--yl-card-border)] bg-white/95 px-4 py-4 shadow-[0_16px_36px_rgba(150,9,83,0.1)]">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#888]">Expired</p>
                <p className="mt-2 text-2xl font-black text-[var(--yl-ink-strong)]">{walletSummary.expired}</p>
              </div>
            </section>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 rounded-[1.6rem] border border-[var(--yl-card-border)] bg-white/90 p-2 shadow-[0_18px_44px_rgba(150,9,83,0.12)]">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={`rounded-[1rem] px-4 py-3 text-sm font-black ${
                  tab === "active"
                    ? "bg-[var(--yl-primary)] text-white"
                    : "bg-[var(--yl-card-bg)] text-[var(--yl-ink-strong)]"
                }`}
              >
                Active ({activeCoupons.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className={`rounded-[1rem] px-4 py-3 text-sm font-black ${
                  tab === "history"
                    ? "bg-[var(--yl-primary)] text-white"
                    : "bg-[var(--yl-card-bg)] text-[var(--yl-ink-strong)]"
                }`}
              >
                History ({historyCoupons.length})
              </button>
            </div>

            {/* Daily limit banner — shown when limit reached and on active tab */}
            {usedToday && tab === "active" && (
              <div className="flex items-start gap-3 rounded-[1.3rem] border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3">
                <span className="mt-0.5 text-base leading-none">ℹ️</span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#3730a3]">
                    Today's redemption limit reached
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[#4338ca]">
                    You've already used a coupon today. Even if you play again and score high, a new coupon won't be redeemable until tomorrow.
                  </p>
                </div>
              </div>
            )}

            {/* Coupon list or empty state */}
            {visibleCoupons.length === 0 ? (
              <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white px-5 py-8 shadow-[0_18px_44px_rgba(150,9,83,0.16)]">
                {tab === "active" ? (
                  (() => {
                    const { title, body, showPlay } = emptyActiveMessage();
                    return (
                      <>
                        <p className="text-lg font-black text-[var(--yl-ink-strong)]">{title}</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">{body}</p>
                        {!usedToday && (
                          <div className="mt-4 rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] p-4 text-sm font-semibold text-[var(--yl-ink-muted)]">
                            Score 30+: 3% Off
                            <br />
                            Score 50+: 5% Off
                            <br />
                            Score 100+: 10% Off
                            <br />
                            Score 150+: 15% Off
                            <br />
                            Score 200+: 20% Off
                          </div>
                        )}
                        {showPlay ? (
                          <Link
                            href="/"
                            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[var(--yl-primary)] px-4 py-3 text-sm font-black text-white"
                          >
                            Play Now
                          </Link>
                        ) : null}
                      </>
                    );
                  })()
                ) : (
                  <>
                    <p className="text-lg font-black text-[var(--yl-ink-strong)]">No coupon history yet</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
                      Used and expired rewards will appear here.
                    </p>
                  </>
                )}
              </section>
            ) : (
              <div className="grid gap-4">
                {visibleCoupons.map((coupon) => (
                  <CouponCard
                    key={coupon.id}
                    coupon={coupon}
                    showQr={tab === "active"}
                    lockedToday={tab === "active" && usedToday}
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
