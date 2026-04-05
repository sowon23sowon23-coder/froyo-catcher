"use client";

import { useEffect, useMemo, useState } from "react";
import { trackEvent } from "../lib/gtag";

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

  useEffect(() => {
    const savedChar = localStorage.getItem("selectedCharacter") as CharId | null;

    if (savedChar && CHARACTERS.some((c) => c.id === savedChar)) setCharacter(savedChar);
    localStorage.removeItem("selectedMode");
  }, []);

  const selectedCharacter = useMemo(
    () => CHARACTERS.find((c) => c.id === character) ?? CHARACTERS[0],
    [character]
  );

  const startGame = () => {
    localStorage.setItem("selectedCharacter", character);

    trackEvent({
      action: "home_start_click",
      category: "engagement",
      label: `${character}_free`,
    });

    onStart(character);
  };

  return (
    <main className="relative h-full overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-5">
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
                className="rounded-full border border-[var(--yl-card-border)] bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[var(--yl-primary)] shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                My Wallet
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
