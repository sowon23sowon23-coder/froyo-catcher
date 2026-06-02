"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { InfoModal, ALL_INFO_CARDS } from "./InfoModal";

import {
  COUPON_REDEEM_COOLDOWN_HOURS,
  COUPON_REWARDS,
  formatCouponExpiry,
  formatCouponLabel,
  getCouponFixedQrValue,
  getCouponRewardByPercent,
  resolveCouponReward,
  getWalletCouponStatus,
  type WalletCoupon,
} from "../lib/coupons";
import { readLocalWalletCoupons, writeLocalWalletCoupons } from "../lib/walletLocalStorage";

const WALLET_REFRESH_INTERVAL_MS = 10000;
const QR_LOADING_MS = 2500;
const QR_ACTIVE_MS = 20000;
const COUPON_RULES = [
  "Participation is limited to users with valid accounts; one account per person.",
  "Coupons have no cash value and cannot be exchanged for cash or credit.",
  "Coupons are non-transferable, non-resaleable, and may not be shared.",
  "Lost, expired, or unused coupons will not be replaced or reissued.",
  "Coupons must be redeemed in-store only and within the 36-hour validity period.",
  "Coupons are valid on weighted items only.",
  "Excludes Swirl To-Go, online orders, third-party delivery, catering, and gift cards.",
  "Coupons are not valid with any other offer, discount, or promotion.",
  "QR codes are time-sensitive (20 seconds) and cannot be saved, duplicated, or reused.",
];

type WalletResponse = {
  nickname?: string;
  coupons?: WalletCoupon[];
  activeCoupons?: WalletCoupon[];
  historyCoupons?: WalletCoupon[];
  canActivateToday?: boolean;
  nextIssuanceAt?: string | null;
  nextRedeemAvailableAt?: string | null;
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

function inferDiscountPercent(coupon: WalletCoupon) {
  const resolvedReward = resolveCouponReward(coupon.rewardType, coupon.title, coupon.description);
  if (resolvedReward) {
    return resolvedReward.discountPercent;
  }

  const candidates = [coupon.title, coupon.description];
  for (const text of candidates) {
    const match = String(text || "").match(/\b(3|5|10|15|20)\s*%/);
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

  return "3%";
}

function resolveCouponQrValue(coupon: WalletCoupon) {
  const directQrValue = getCouponFixedQrValue(coupon.rewardType);
  if (directQrValue) return directQrValue;

  const inferredPercent = inferDiscountPercent(coupon);
  if (inferredPercent) {
    return getCouponRewardByPercent(inferredPercent)?.fixedQrValue ?? null;
  }

  return getCouponRewardByPercent(3)?.fixedQrValue ?? null;
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
  const isRedeemed = coupon.status === "redeemed";
  const detailText = isRedeemed
    ? `Redeemed on ${
        coupon.redeemedAt
          ? new Date(coupon.redeemedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : "Unknown date"
      }.`
    : `Expired on ${formatCouponExpiry(coupon.expiresAt)}.`;

  return (
    <article
      className={`rounded-[1.25rem] border-2 bg-white px-4 py-4 shadow-[0_12px_24px_rgba(150,9,83,0.08)] ${
        isRedeemed ? "border-[#c4f0c8]" : "border-[#ffe0b2]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base ${
            isRedeemed ? "bg-[#e8f5e9] text-[#2e7d32]" : "bg-[#fff3e0] text-[#e65100]"
          }`}>
            {isRedeemed ? "✓" : "⏰"}
          </span>
          <div>
            <h2 className="text-base font-black text-[var(--yl-ink-strong)]">{resolveCouponLabel(coupon)} Discount</h2>
            <p className="mt-0.5 text-xs font-semibold text-[var(--yl-ink-muted)]">{detailText}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
          isRedeemed ? "bg-[#e8f5e9] text-[#2e7d32]" : "bg-[#fff3e0] text-[#e65100]"
        }`}>
          {isRedeemed ? "Used" : "Expired"}
        </span>
      </div>
      {(coupon.redeemedStoreName || coupon.redeemedStaffName) && isRedeemed ? (
        <p className="mt-2 text-xs font-semibold text-[var(--yl-ink-muted)] pl-10">
          {coupon.redeemedStoreName ? `Store: ${coupon.redeemedStoreName}` : ""}
          {coupon.redeemedStoreName && coupon.redeemedStaffName ? " · " : ""}
          {coupon.redeemedStaffName ? `Staff: ${coupon.redeemedStaffName}` : ""}
        </p>
      ) : null}
    </article>
  );
}

function useIsUrgent(expiresAt: string) {
  const remaining = useCountdown(expiresAt);
  const didVibrateRef = useRef(false);

  useEffect(() => {
    if (remaining && remaining.totalSec < 3600 && !didVibrateRef.current) {
      didVibrateRef.current = true;
      if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
    }
  }, [remaining]);

  return remaining ? remaining.totalSec < 3600 : false;
}

function useCountdown(expiresAt: string) {
  const calc = () => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(diff) || diff <= 0) return null;
    const totalSec = Math.floor(diff / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { h, m, s, totalSec };
  };

  const [remaining, setRemaining] = useState(calc);

  useEffect(() => {
    const id = window.setInterval(() => setRemaining(calc()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return remaining;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function use24hCountdown(nextIssuanceAt: string | null) {
  const targetMs = nextIssuanceAt ? new Date(nextIssuanceAt).getTime() : null;
  const calc = () => (targetMs ? Math.max(0, targetMs - Date.now()) : 0);
  const [ms, setMs] = useState(calc);
  useEffect(() => {
    if (!targetMs) { setMs(0); return; }
    const id = window.setInterval(() => setMs(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return { ms, formatted: `${pad(h)}:${pad(m)}:${pad(s)}` };
}

function getLatestRedeemUnlockIso(coupons: WalletCoupon[]) {
  const latestRedeemedMs = coupons.reduce((latest, coupon) => {
    if (coupon.status !== "redeemed" || !coupon.redeemedAt) return latest;
    const redeemedMs = new Date(coupon.redeemedAt).getTime();
    return Number.isFinite(redeemedMs) ? Math.max(latest, redeemedMs) : latest;
  }, 0);

  if (!latestRedeemedMs) return null;
  const unlockMs = latestRedeemedMs + COUPON_REDEEM_COOLDOWN_HOURS * 60 * 60 * 1000;
  return unlockMs > Date.now() ? new Date(unlockMs).toISOString() : null;
}

function formatUnlockDateTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatExpiryDatetime(expiresAt: string) {
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function CouponExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const remaining = useCountdown(expiresAt);

  if (!remaining) {
    return (
      <p className="mt-2 text-xs font-semibold text-red-500">Expired</p>
    );
  }

  const urgent = remaining.totalSec < 3600; // less than 1 hour

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-[var(--yl-ink-muted)]">
        Expires {formatExpiryDatetime(expiresAt)}
      </p>
      <span
        className={`rounded-full px-2.5 py-0.5 font-black tabular-nums text-[11px] ${
          urgent
            ? "bg-red-100 text-red-600"
            : remaining.totalSec < 7200
            ? "bg-orange-100 text-orange-600"
            : "bg-[#f0faea] text-[#2f6c1a]"
        }`}
      >
        {remaining.h > 0 && `${pad(remaining.h)}:`}{pad(remaining.m)}:{pad(remaining.s)}
      </span>
    </div>
  );
}

function CouponUnlockCountdown({ nextRedeemAvailableAt }: { nextRedeemAvailableAt: string | null }) {
  const { ms, formatted } = use24hCountdown(nextRedeemAvailableAt);
  if (!nextRedeemAvailableAt || ms <= 0) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-indigo-500">
        Opens {formatUnlockDateTime(nextRedeemAvailableAt)}
      </p>
      <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 font-black tabular-nums text-[11px] text-indigo-600">
        {formatted}
      </span>
    </div>
  );
}

function ActiveCouponCard({
  coupon,
  uiState,
  progress,
  activeCouponId,
  secondsLeft,
  qrDataUrl,
  canActivateToday,
  nextRedeemAvailableAt,
  onStart,
  onCancel,
}: {
  coupon: WalletCoupon;
  uiState: WalletUiState;
  progress: number;
  activeCouponId: number | null;
  secondsLeft: number;
  qrDataUrl: string;
  canActivateToday: boolean;
  nextRedeemAvailableAt: string | null;
  onStart: () => void;
  onCancel: () => void;
}) {
  const isUrgent = useIsUrgent(coupon.expiresAt);
  const isLocked = !canActivateToday;

  return (
    <article
      className={`overflow-hidden rounded-[1.5rem] border-2 bg-white shadow-[0_14px_32px_rgba(150,9,83,0.14)] transition-colors ${
        isLocked ? "border-indigo-200" : isUrgent ? "border-red-400" : "border-[var(--yl-card-border)]"
      }`}
    >
      <div className={`px-4 py-4 ${isLocked ? "bg-[linear-gradient(135deg,#f5f3ff,#ede9fe)]" : isUrgent ? "bg-[linear-gradient(135deg,#fff5f5,#ffe0e0)]" : "bg-[linear-gradient(135deg,#fff8fb,#ffe6f2)]"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${isLocked ? "text-indigo-600" : isUrgent ? "text-red-500" : "text-[var(--yl-primary)]"}`}>
              {isLocked ? "🔒 Locked Coupon" : isUrgent ? "⚠️ Expiring Soon" : "Available Coupon"}
            </p>
            <h2 className="mt-2 text-xl font-black text-[var(--yl-ink-strong)]">{resolveCouponLabel(coupon)} Discount</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
            isLocked ? "bg-indigo-100 text-indigo-600" : isUrgent ? "bg-red-100 text-red-600" : "bg-[#eff9ea] text-[#2f6c1a]"
          }`}>
            {isLocked ? "Locked" : isUrgent ? "Urgent" : "Available"}
          </span>
        </div>
        <CouponExpiryCountdown expiresAt={coupon.expiresAt} />
        {isLocked && <CouponUnlockCountdown nextRedeemAvailableAt={nextRedeemAvailableAt} />}
      </div>

      <div className="grid gap-3 px-4 py-4">
        <button
          type="button"
          onClick={onStart}
          disabled={uiState === "loading" || uiState === "active" || !canActivateToday}
          className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-[#fffafc] px-3 py-3 text-left disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Store Use</p>
              <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">
                {!canActivateToday
                  ? `Saved in your wallet — cannot be used yet. Press "Use" after the coupon unlocks.`
                  : 'Press the "Use" button only when directed to do so by the emaployee.'}
              </p>
            </div>
            <span
              className={`max-w-[7.75rem] rounded-full bg-[var(--yl-primary)] px-4 py-2 text-center text-xs font-black uppercase leading-tight tracking-[0.08em] text-white ${
                uiState === "loading" || uiState === "active" || !canActivateToday ? "opacity-50" : ""
              }`}
            >
              {uiState === "loading" ? "Generating" : uiState === "active" ? "Live" : !canActivateToday ? "Unlocks Soon" : "Use"}
            </span>
          </div>
        </button>

        {(() => {
          const resolved = resolveCouponReward(coupon.rewardType, coupon.title, coupon.description);
          const maxDiscount = COUPON_REWARDS[0].discountPercent;
          const canUpgrade = resolved ? resolved.discountPercent < maxDiscount : false;
          return canUpgrade ? (
            <p className="px-1 text-[11px] font-semibold text-[var(--yl-ink-muted)]">
              Play again and score higher to upgrade this coupon to a bigger discount.
            </p>
          ) : null;
        })()}

        {activeCouponId === coupon.id && uiState === "loading" ? (
          <div className="rounded-[1.25rem] border border-[var(--yl-card-border)] bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border-4 border-[var(--yl-primary)] border-t-transparent animate-spin" />
              <div className="flex-1">
                <p className="text-sm font-black text-[var(--yl-ink-strong)]">Generating secure coupon...</p>
                <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">
                  The QR appears after a short secure loading animation.
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="flex-shrink-0 rounded-full border border-[var(--yl-card-border)] px-3 py-1.5 text-xs font-black text-[var(--yl-ink-muted)] hover:bg-gray-50"
              >
                Cancel
              </button>
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
}

function DailyLimitEmptyState({ nextIssuanceAt }: { nextIssuanceAt: string | null }) {
  const { formatted } = use24hCountdown(nextIssuanceAt);
  return (
    <>
      <p className="text-lg font-black text-[var(--yl-ink-strong)]">Coupon use is cooling down.</p>
      <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
        You can still earn coupons and keep them here. They can be used after the unlock time.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-[1rem] border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3">
        <span className="text-xs font-black uppercase tracking-[0.1em] text-[#4338ca]">
          Coupons unlock in
        </span>
        <span className="font-mono text-base font-black tabular-nums text-[#3730a3]">
          {formatted}
        </span>
      </div>
    </>
  );
}

function CouponPolicyCard() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white/90 shadow-[0_10px_28px_rgba(150,9,83,0.10)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">
          How to Use Your Coupons
        </span>
        <span className="text-xs font-black text-[var(--yl-primary)]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--yl-card-border)] px-5 pb-5 pt-4 text-xs font-semibold text-[var(--yl-ink-muted)]">
          <p className="mb-2 font-black text-[var(--yl-ink-strong)]">Daily Limits</p>
          <ul className="mb-4 list-inside list-disc space-y-1">
            <li>You can keep earning coupons and save them in your wallet.</li>
            <li>After using a coupon, the next coupon unlocks <span className="font-black text-[var(--yl-ink-strong)]">24 hours</span> later.</li>
            <li>Each coupon expires <span className="font-black text-[var(--yl-ink-strong)]">36 hours</span> after it is issued.</li>
          </ul>

          <p className="mb-2 font-black text-[var(--yl-ink-strong)]">Redeeming at the Store</p>
          <ul className="mb-4 list-inside list-disc space-y-1">
            <li>At checkout, open this wallet and show your coupon to a staff member.</li>
            <li>Press the "Use" button only when directed to do so by the emaployee.</li>
            <li>The QR is valid for <span className="font-black text-[var(--yl-ink-strong)]">20 seconds</span> for the staff to scan and apply your discount.</li>
            <li>Once used, the coupon cannot be reused.</li>
          </ul>

          <p className="mb-2 font-black text-[var(--yl-ink-strong)]">Coupon Tiers</p>
          <div className="grid grid-cols-2 gap-1">
            <span className="rounded-lg bg-[#fff0f6] px-2 py-1 text-center font-black text-[var(--yl-primary)]">30+ pts → 3% OFF</span>
            <span className="rounded-lg bg-[#fff0f6] px-2 py-1 text-center font-black text-[var(--yl-primary)]">50+ pts → 5% OFF</span>
            <span className="rounded-lg bg-[#fff0f6] px-2 py-1 text-center font-black text-[var(--yl-primary)]">100+ pts → 10% OFF</span>
            <span className="rounded-lg bg-[#fff0f6] px-2 py-1 text-center font-black text-[var(--yl-primary)]">150+ pts → 15% OFF</span>
            <span className="col-span-2 rounded-lg bg-[#fff0f6] px-2 py-1 text-center font-black text-[var(--yl-primary)]">200+ pts → 20% OFF</span>
          </div>

          <p className="mb-2 mt-4 font-black text-[var(--yl-ink-strong)]">Coupon Rules</p>
          <ul className="list-inside list-disc space-y-1">
            {COUPON_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
  const [canActivateToday, setCanActivateToday] = useState(true);
  const [nextIssuanceAt, setNextIssuanceAt] = useState<string | null>(null);
  const [showCouponRules, setShowCouponRules] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_ACTIVE_MS / 1000);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [networkErrorToast, setNetworkErrorToast] = useState(false);

  const activeCouponsRef = useRef<WalletCoupon[]>([]);
  const historyCouponsRef = useRef<WalletCoupon[]>([]);
  const activeCouponIdRef = useRef<number | null>(null);
  const autoSelectedTabRef = useRef(false);
  const generationTimeoutRef = useRef<number | null>(null);
  const countdownTimeoutRef = useRef<number | null>(null);
  const clockIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    activeCouponsRef.current = activeCoupons;
  }, [activeCoupons]);

  useEffect(() => {
    historyCouponsRef.current = historyCoupons;
  }, [historyCoupons]);

  useEffect(() => {
    activeCouponIdRef.current = activeCouponId;
  }, [activeCouponId]);

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

  useEffect(() => {
    setShowCouponRules(true);
  }, []);

  const isQrVisible = useMemo(() => {
    if (activeCouponId === null) return false;
    const uiState = walletUiStates[activeCouponId];
    return uiState === "loading" || uiState === "active";
  }, [activeCouponId, walletUiStates]);

  useEffect(() => {
    const html = document.documentElement;
    if (isQrVisible) {
      html.style.filter = "brightness(2)";
    } else {
      html.style.filter = "";
    }
    return () => {
      html.style.filter = "";
    };
  }, [isQrVisible]);

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
      // While a coupon QR is actively displayed, skip the refresh.
      // The server has already marked the coupon expired, so a refresh
      // would pull it out of activeCoupons and clear the QR mid-display.
      // expireCoupon() handles local cleanup once the countdown ends.
      if (activeCouponIdRef.current !== null) return;

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
            if (!autoSelectedTabRef.current && requestedTab === "active" && nextActive.length === 0 && nextHistory.length > 0) {
              autoSelectedTabRef.current = true;
              setTab("history");
            }
            writeLocalWalletCoupons([...nextActive, ...nextHistory]);
            setError(null);
            const allLocal = [...nextActive, ...nextHistory];
            setNextIssuanceAt(getLatestRedeemUnlockIso(allLocal));
            return;
          }

          setError(json.error || (res.status === 401 ? "Please log in to open your wallet." : "Failed to load wallet."));
          setActiveCoupons([]);
          setHistoryCoupons([]);
          return;
        }

        setNickname(String(json.nickname || "").trim());
        if (typeof json.canActivateToday === "boolean") setCanActivateToday(json.canActivateToday);
        const serverActive = Array.isArray(json.activeCoupons) ? json.activeCoupons : [];
        const serverHistory = Array.isArray(json.historyCoupons) ? json.historyCoupons : [];

        // Local "expired / redeemed" status takes priority over server "active".
        // If the server expire call failed (network error, etc.) the coupon would
        // still appear as active on the server, causing the wallet refresh to
        // restore it. By filtering those tokens out here, we ensure a locally
        // consumed coupon never comes back to the active tab.
        const locallyUsedTokens = new Set(
          localCoupons.filter((c) => c.status !== "active").map((c) => c.redeemToken)
        );
        const effectiveServerActive = serverActive.filter(
          (c) => !locallyUsedTokens.has(c.redeemToken)
        );

        const mergedLocal = localCoupons.filter(
          (coupon) =>
            !effectiveServerActive.some((serverCoupon) => serverCoupon.redeemToken === coupon.redeemToken) &&
            !serverHistory.some((serverCoupon) => serverCoupon.redeemToken === coupon.redeemToken)
        );
        const reconciled = await reconcileActiveCoupons([
          ...effectiveServerActive,
          ...mergedLocal.filter((coupon) => coupon.status === "active"),
        ]);
        const nextHistory = [
          ...serverHistory,
          ...mergedLocal.filter((coupon) => coupon.status !== "active"),
          ...reconciled.historyCoupons,
        ].sort(
          (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
        );

        setActiveCoupons(reconciled.activeCoupons);
        setHistoryCoupons(nextHistory);
        if (!autoSelectedTabRef.current && requestedTab === "active" && reconciled.activeCoupons.length === 0 && nextHistory.length > 0) {
          autoSelectedTabRef.current = true;
          setTab("history");
        }
        writeLocalWalletCoupons([...reconciled.activeCoupons, ...nextHistory]);

        // Derive the 24-hour redeem unlock from the full merged coupon list as a fallback.
        const allKnownCoupons = [...reconciled.activeCoupons, ...nextHistory];
        const derivedNextIssuanceAt = getLatestRedeemUnlockIso(allKnownCoupons);
        const serverNextIssuanceAt =
          typeof json.nextRedeemAvailableAt === "string"
            ? json.nextRedeemAvailableAt
            : typeof json.nextIssuanceAt === "string"
              ? json.nextIssuanceAt
              : null;
        setNextIssuanceAt(
          serverNextIssuanceAt && derivedNextIssuanceAt
            ? (serverNextIssuanceAt > derivedNextIssuanceAt ? serverNextIssuanceAt : derivedNextIssuanceAt)
            : serverNextIssuanceAt ?? derivedNextIssuanceAt
        );

        setError(null);
      } catch {
        if (!active) return;
        setError("Failed to load wallet.");
        setActiveCoupons([]);
        setHistoryCoupons([]);
        setNetworkErrorToast(true);
        window.setTimeout(() => setNetworkErrorToast(false), 4000);
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

  // Move expired coupons to history immediately when their countdown hits zero,
  // without waiting for the next server refresh.
  useEffect(() => {
    if (activeCoupons.length === 0) return;

    const checkId = window.setInterval(() => {
      const now = Date.now();
      const nowExpired = activeCouponsRef.current.filter(
        (c) => new Date(c.expiresAt).getTime() <= now
      );
      if (nowExpired.length === 0) return;

      const expiredIds = new Set(nowExpired.map((c) => c.id));
      setActiveCoupons((prev) => prev.filter((c) => !expiredIds.has(c.id)));
      setHistoryCoupons((prev) => {
        const added = nowExpired.map((c) => ({ ...c, status: "expired" as const, state: "expired" as const }));
        return [...added, ...prev.filter((c) => !expiredIds.has(c.id))].sort(
          (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
        );
      });
    }, 1000);

    return () => window.clearInterval(checkId);
  }, [activeCoupons]);


  // Send a single final-state request; if it fails, retry once after 3 seconds.
  // The coupon is already locked in local state; this is only DB sync.
  const syncCouponStateToServer = (couponId: number, action: "expired" | "redeemed") => {
    const body = JSON.stringify({ couponId, action });
    const doFetch = () =>
      fetch("/api/coupons/wallet/expire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

    void doFetch().catch(() => {
      window.setTimeout(() => void doFetch().catch(() => undefined), 3000);
    });
  };

  const cancelCouponFlow = (couponId: number) => {
    clearQrTimers();
    setWalletUiStates((prev) => ({ ...prev, [couponId]: "idle" }));
    setActiveCouponId(null);
    setQrDataUrl("");
    setSecondsLeft(QR_ACTIVE_MS / 1000);
  };

  const completeRedeemedCoupon = async (coupon: WalletCoupon) => {
    clearQrTimers();
    setWalletUiStates((prev) => ({ ...prev, [coupon.id]: "idle" }));
    setActiveCouponId(null);
    setSecondsLeft(0);
    setQrDataUrl("");

    const redeemedAt = new Date().toISOString();
    const redeemedCoupon: WalletCoupon = {
      ...coupon,
      status: "redeemed",
      state: "already_redeemed",
      redeemedAt,
    };

    const nextActive = activeCouponsRef.current.filter((item) => item.id !== coupon.id);
    const nextHistory = [redeemedCoupon, ...historyCouponsRef.current.filter((item) => item.id !== coupon.id)].sort(
      (a, b) => new Date(b.redeemedAt || b.expiresAt).getTime() - new Date(a.redeemedAt || a.expiresAt).getTime()
    );

    setActiveCoupons(nextActive);
    setHistoryCoupons(nextHistory);
    setTab("history");
    writeLocalWalletCoupons([...nextActive, ...nextHistory]);

    syncCouponStateToServer(coupon.id, "redeemed");
  };

  const startCouponFlow = (coupon: WalletCoupon) => {
    if (!canUseToday) return;

    // resolveCouponQrValue always returns a string (fallback to 3% QR value),
    // so we proceed regardless. If the value is somehow null, the QR image
    // will show "Loading QR..." but the loading/active/expired flow still works.

    clearQrTimers();
    setTab("active");
    setQrDataUrl("");
    setSecondsLeft(QR_ACTIVE_MS / 1000);
    setActiveCouponId(coupon.id);
    setWalletUiStates((prev) => ({ ...prev, [coupon.id]: "loading" }));

    generationTimeoutRef.current = window.setTimeout(() => {
      setWalletUiStates((prev) => ({ ...prev, [coupon.id]: "active" }));
      setSecondsLeft(QR_ACTIVE_MS / 1000);

      // Mark the coupon as consumed on the server the instant the QR
      // becomes visible. Retries once on failure so a brief network hiccup
      // doesn't leave the coupon re-usable after a page reload.
      syncCouponStateToServer(coupon.id, "redeemed");

      clockIntervalRef.current = window.setInterval(() => {
        setSecondsLeft((prev) => Math.max(prev - 1, 0));
      }, 1000);

      countdownTimeoutRef.current = window.setTimeout(() => {
        void completeRedeemedCoupon(coupon);
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

  const localNextRedeemAvailableAt = useMemo(
    () => getLatestRedeemUnlockIso(historyCoupons),
    [historyCoupons]
  );
  const localRedeemLocked = Boolean(
    localNextRedeemAvailableAt && new Date(localNextRedeemAvailableAt).getTime() > Date.now()
  );

  const canUseToday = canActivateToday && !localRedeemLocked;
  const effectiveNextIssuanceAt = nextIssuanceAt || localNextRedeemAvailableAt;

  const issuanceBlockedMs = useMemo(() => {
    if (!effectiveNextIssuanceAt) return 0;
    return Math.max(0, new Date(effectiveNextIssuanceAt).getTime() - Date.now());
  }, [effectiveNextIssuanceAt]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-5">
      {showCouponRules && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setShowCouponRules(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Coupon rules"
        >
          <div
            className="relative flex max-h-[calc(100vh-3rem)] w-full max-w-sm flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src="/coupon-rules.png"
              alt="Coupon Rules"
              className="w-full rounded-3xl shadow-2xl"
              draggable={false}
            />

            <button
              type="button"
              onClick={() => setShowCouponRules(false)}
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[var(--yl-primary)] text-2xl font-black leading-none text-white shadow-[0_8px_18px_rgba(77,41,49,0.35)]"
              aria-label="Close"
            >
              X
            </button>

            <div className="mt-4 w-full rounded-2xl bg-white/95 px-4 py-3 shadow-lg">
              <button
                type="button"
                onClick={() => setShowCouponRules(false)}
                className="w-full rounded-xl bg-[linear-gradient(135deg,var(--yl-primary),var(--yl-primary-soft))] py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[0_8px_20px_rgba(150,9,83,0.35)] transition hover:-translate-y-0.5"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
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
            Press the "Use" button only when directed to do so by the emaployee.
          </p>
        </header>

        <CouponPolicyCard />

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
                {!canUseToday || issuanceBlockedMs > 0 ? (
                  <DailyLimitEmptyState nextIssuanceAt={effectiveNextIssuanceAt} />
                ) : (
                  <>
                    <p className="text-lg font-black text-[var(--yl-ink-strong)]">No active coupons yet</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
                      Play the game and catch some froyo to earn your reward!
                    </p>
                  </>
                )}
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
                  const progress = uiState === "active" ? (secondsLeft / (QR_ACTIVE_MS / 1000)) * 100 : 0;

                  return (
                    <ActiveCouponCard
                      key={coupon.id}
                      coupon={coupon}
                      uiState={uiState}
                      progress={progress}
                      activeCouponId={activeCouponId}
                      secondsLeft={secondsLeft}
                      qrDataUrl={qrDataUrl}
                      canActivateToday={canUseToday}
                      nextRedeemAvailableAt={effectiveNextIssuanceAt}
                      onStart={() => startCouponFlow(coupon)}
                      onCancel={() => cancelCouponFlow(coupon.id)}
                    />
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

      {networkErrorToast && (
        <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-[#1c1c1e] px-4 py-3 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="text-lg">📶</span>
            <div>
              <p className="text-sm font-black text-white">Connection Error</p>
              <p className="text-xs font-semibold text-white/70">Please check your internet connection.</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
