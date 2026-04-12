"use client";

import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "../lib/gtag";
import { InfoModal, ALL_INFO_CARDS, type InfoCard } from "./InfoModal";
import { getWalletCouponStatus } from "../lib/coupons";

type CharId = "green" | "berry" | "sprinkle";

type CharacterOption = {
  id: CharId;
  label: string;
  flavor: string;
  accent: string;
};

const CHARACTERS: CharacterOption[] = [
  { id: "green", label: "Pistachio", flavor: "Smooth and steady", accent: "var(--yl-green)" },
  { id: "berry", label: "Berry Burst", flavor: "Fast and lively", accent: "var(--yl-berry)" },
  { id: "sprinkle", label: "Sprinkle Pop", flavor: "Playful and bright", accent: "var(--yl-yellow)" },
];

type InfoButton = {
  label: string;
  emoji: string;
  index: number;
};

const INFO_BUTTONS: InfoButton[] = [
  { label: "Game Rules", emoji: "🎮", index: 0 },
  { label: "How to Redeem", emoji: "🎁", index: 1 },
  { label: "Coupon Rules", emoji: "📋", index: 2 },
  { label: "Coupon Tiers", emoji: "⭐", index: 3 },
];

export default function HomeScreen({
  nickname,
  todayBestScore,
  onStart,
  onOpenLeaderboard,
  onOpenAdmin,
  onSwitchAccount,
  onLogout,
}: {
  nickname?: string;
  todayBestScore?: number;
  onStart: (character: CharId) => void;
  onOpenLeaderboard: () => void;
  onOpenAdmin: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
}) {
  const [character, setCharacter] = useState<CharId>("green");
  const [infoIndex, setInfoIndex] = useState<number | null>(null);
  const [showStartRules, setShowStartRules] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [activeCouponCount, setActiveCouponCount] = useState(0);

  useEffect(() => {
    const savedChar = localStorage.getItem("selectedCharacter") as CharId | null;
    if (savedChar && CHARACTERS.some((c) => c.id === savedChar)) setCharacter(savedChar);
    localStorage.removeItem("selectedMode");

    try {
      const raw = localStorage.getItem("walletCouponsLocal");
      const coupons = raw ? (JSON.parse(raw) as Array<{ status?: string; expiresAt?: string; redeemedAt?: string | null }>) : [];
      const count = coupons.filter(
        (c) => getWalletCouponStatus({ status: c.status, expiresAt: c.expiresAt, redeemedAt: c.redeemedAt }) === "active"
      ).length;
      setActiveCouponCount(count);
    } catch {
      // ignore parse errors
    }
  }, []);

  const selectedCharacter = useMemo(
    () => CHARACTERS.find((c) => c.id === character) ?? CHARACTERS[0],
    [character]
  );

  const handleStartRulesClose = (launch: boolean) => {
    if (dontShowAgain) {
      localStorage.setItem("hideGameRules", "1");
    }
    setShowStartRules(false);
    if (launch) {
      localStorage.setItem("selectedCharacter", character);
      trackEvent({ action: "home_start_click", category: "engagement", label: `${character}_free` });
      onStart(character);
    }
  };

  const startGame = () => {
    localStorage.setItem("selectedCharacter", character);
    trackEvent({ action: "home_start_click", category: "engagement", label: `${character}_free` });

    const skip = localStorage.getItem("hideGameRules") === "1";
    if (skip) {
      onStart(character);
    } else {
      setDontShowAgain(false);
      setShowStartRules(true);
    }
  };

  return (
    <main className="relative h-full overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-5">
      {infoIndex !== null && (
        <InfoModal
          cards={ALL_INFO_CARDS}
          initialIndex={infoIndex}
          onClose={() => setInfoIndex(null)}
        />
      )}

      {showStartRules && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => handleStartRulesClose(false)}
        >
          <div
            className="relative flex w-full max-w-[280px] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src="/game-rules.png"
              alt="Game Rules"
              className="w-full rounded-3xl shadow-2xl"
              draggable={false}
            />

            <button
              type="button"
              onClick={() => handleStartRulesClose(false)}
              className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white font-black text-[var(--yl-primary)] shadow-lg text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>

            <div className="mt-4 w-full rounded-2xl bg-white/95 px-4 py-3 shadow-lg">
              <label className="mb-3 flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-[var(--yl-primary)]"
                />
                <span className="text-xs font-semibold text-[var(--yl-ink-muted)]">
                  Don&apos;t show this again
                </span>
              </label>
              <button
                type="button"
                onClick={() => handleStartRulesClose(true)}
                className="w-full rounded-xl bg-[linear-gradient(135deg,var(--yl-primary),var(--yl-primary-soft))] py-3 text-sm font-black uppercase tracking-[0.1em] text-white shadow-[0_8px_20px_rgba(150,9,83,0.35)] transition hover:-translate-y-0.5"
              >
                Let&apos;s Play!
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full bg-white/70 blur-2xl" />
      <div className="pointer-events-none absolute -left-14 bottom-10 h-44 w-44 rounded-full bg-[#9ee86b]/30 blur-2xl" />

      <div className="relative z-10 mx-auto flex h-full max-w-sm flex-col">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <img
                src="/yogurtland-logo.png"
                alt="Yogurtland"
                className="h-7 w-auto"
                draggable={false}
              />
              <h1 className="text-xl font-black text-[var(--yl-ink-strong)]">Froyo Catcher</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAdmin}
            aria-label="Open admin and feedback menu"
            title="Admin / Feedback"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--yl-card-border)] bg-white text-base shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
          >
            🛠️
          </button>
        </header>

        {nickname ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-black uppercase tracking-[0.1em] text-[var(--yl-ink-muted)]">
              Logged in as <span className="text-[var(--yl-primary)]">{nickname}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <a
                href="/wallet"
                className="relative rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[var(--yl-primary)] shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                My Wallet
                {activeCouponCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--yl-primary)] text-[9px] font-black text-white">
                    {activeCouponCount}
                  </span>
                )}
              </a>
              <button
                type="button"
                onClick={onSwitchAccount}
                className="rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[var(--yl-primary)] shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                Switch Nickname
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[var(--yl-primary-soft)] shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                Log Out
              </button>
            </div>
          </div>
        ) : null}

        <section className="mb-4 rounded-3xl border border-[var(--yl-card-border)] bg-white/85 p-5 shadow-[0_16px_40px_rgba(150,9,83,0.16)] backdrop-blur-sm">
          <div className="flex items-center justify-between rounded-2xl bg-[var(--yl-card-bg)] px-4 py-3 ring-1 ring-[var(--yl-card-border)]">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--yl-primary)]">Today&apos;s Best Score</p>
              {typeof todayBestScore === "number" && todayBestScore > 0 ? (
                <p className="text-2xl font-black text-[var(--yl-ink-strong)]">{todayBestScore}</p>
              ) : (
                <p className="text-sm font-bold text-[var(--yl-ink-muted)]">Play the game first.</p>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-1.5 text-sm font-black text-[var(--yl-primary)] shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
            >
              Leaderboard
            </button>
          </div>
        </section>

        <section className="mb-3">
          <p className="mb-2 text-sm font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Pick your cup</p>
          <div className="grid grid-cols-3 gap-2">
            {CHARACTERS.map((c) => {
              const active = c.id === character;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCharacter(c.id)}
                  className={`rounded-2xl border bg-white px-2 py-2 text-center transition ${
                    active
                      ? "-translate-y-0.5 border-[#79d854] shadow-[0_10px_24px_rgba(72,175,53,0.24)]"
                      : "border-white/70 hover:-translate-y-0.5"
                  }`}
                >
                  <div
                    className="mx-auto mb-1 grid h-11 w-11 place-items-center rounded-2xl"
                    style={{ background: `${c.accent}22` }}
                  >
                    <img src={`/${c.id}.png`} alt={c.label} className="h-10 w-10 select-none" draggable={false} />
                  </div>
                  <p className="text-xs font-black text-[var(--yl-ink-strong)]">{c.label}</p>
                  <p className="text-xs font-bold text-[var(--yl-ink-muted)]">{c.flavor}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Info buttons */}
        <section className="mb-3">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--yl-primary)]">Game Info</p>
          <div className="grid grid-cols-2 gap-2">
            {INFO_BUTTONS.map((btn) => (
              <button
                key={btn.index}
                type="button"
                onClick={() => setInfoIndex(btn.index)}
                className="flex items-center gap-2 rounded-2xl border border-[var(--yl-card-border)] bg-white/90 px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5"
              >
                <span className="text-xl leading-none">{btn.emoji}</span>
                <span className="text-xs font-black text-[var(--yl-ink-strong)]">{btn.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-auto rounded-2xl border border-[var(--yl-card-border)] bg-white/85 p-3 shadow-[0_8px_22px_rgba(150,9,83,0.14)]">
          <button
            type="button"
            onClick={startGame}
            className="mt-3 w-full rounded-xl bg-[linear-gradient(135deg,var(--yl-primary),var(--yl-primary-soft))] px-4 py-3 text-base font-black uppercase tracking-[0.1em] text-white shadow-[0_14px_24px_rgba(150,9,83,0.35)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
          >
            Start Game
          </button>
          <p className="mt-2 text-center text-xs font-bold text-[var(--yl-ink-muted)]">
            Selected: {selectedCharacter.label} · Free Play
          </p>
        </section>
      </div>
    </main>
  );
}
