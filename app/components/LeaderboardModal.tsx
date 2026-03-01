"use client";

import { useEffect } from "react";
import StoreCombobox from "./StoreCombobox";

type CharId = "green" | "berry" | "sprinkle";

export type LeaderRow = {
  rank: number;
  nickname: string;
  score: number;
  date?: string;
  character?: CharId;
};

export type LeaderMode = "today" | "all";

function characterLabel(character?: CharId) {
  if (character === "green") return "Green";
  if (character === "berry") return "Berry";
  if (character === "sprinkle") return "Sprinkle";
  return "-";
}

export default function LeaderboardModal({
  open,
  onClose,
  rows,
  loading = false,
  stores,
  selectedStore,
  onStoreChange,
  myNickname,
  myScore,
  myRank,
  mode,
  onModeChange,
}: {
  open: boolean;
  onClose: () => void;
  rows: LeaderRow[];
  loading?: boolean;
  stores: string[];
  selectedStore: string;
  onStoreChange: (store: string) => void;
  myNickname?: string;
  myScore?: number;
  myRank?: number;
  mode: LeaderMode;
  onModeChange: (m: LeaderMode) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const inTop20 = myRank !== undefined ? myRank <= 20 : false;
  const myNickLower = myNickname?.trim().toLowerCase();
  const hasMyRow =
    !!myNickLower && rows.some((r) => r.nickname.trim().toLowerCase() === myNickLower);
  const mergedRows: LeaderRow[] =
    myNickname && myScore !== undefined && !hasMyRow
      ? rows.concat([
          {
            rank: myRank ?? Math.max(21, rows.length + 1),
            nickname: myNickname,
            score: myScore,
          },
        ])
      : rows;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#2b0d1f]/45 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-[1.7rem] border border-[var(--yl-card-border)] bg-white shadow-[0_24px_50px_rgba(150,9,83,0.28)]">
        <div className="bg-[linear-gradient(135deg,#fff1f8,#f8c8df)] px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Top 20</p>
              <h2 className="text-2xl font-black text-[var(--yl-ink-strong)]">Leaderboard</h2>
            </div>
            <button
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--yl-card-border)] bg-white text-[var(--yl-primary-deep)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              aria-label="close"
              title="Close leaderboard"
              type="button"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-1 ring-1 ring-[var(--yl-card-border)]">
            <button
              type="button"
              onClick={() => onModeChange("today")}
              className={`rounded-lg py-2 text-sm font-black transition ${
                mode === "today" ? "bg-[var(--yl-primary)] text-white" : "text-[var(--yl-ink-muted)]"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onModeChange("all")}
              className={`rounded-lg py-2 text-sm font-black transition ${
                mode === "all" ? "bg-[var(--yl-primary)] text-white" : "text-[var(--yl-ink-muted)]"
              }`}
            >
              All-time
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onStoreChange("__ALL__")}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-black transition ${
                selectedStore === "__ALL__"
                  ? "bg-[var(--yl-primary)] text-white"
                  : "border border-[var(--yl-card-border)] bg-white text-[var(--yl-ink-muted)]"
              }`}
            >
              All Stores
            </button>
            <StoreCombobox
              stores={stores}
              value={selectedStore === "__ALL__" ? "" : selectedStore}
              onChange={(store) => onStoreChange(store)}
              placeholder="Search store…"
              wrapperClassName="min-w-0 flex-1"
              inputClassName="w-full rounded-lg border border-[var(--yl-card-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--yl-ink-muted)] outline-none focus:border-[var(--yl-primary)]"
            />
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {(myNickname || myScore !== undefined) && (
            <div className="mb-3 rounded-2xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-4 py-3">
              <p className="text-sm font-black uppercase tracking-[0.1em] text-[var(--yl-primary)]">
                {mode === "today" ? "Today best" : "Your best"}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <div className="truncate pr-3 font-black text-[var(--yl-ink-strong)]">{myNickname ?? "-"}</div>
                <div className="text-lg font-black text-[var(--yl-primary)]">{myScore ?? "-"}</div>
              </div>
              {myRank !== undefined && (
                <p className="mt-2 text-sm font-bold text-[var(--yl-ink-muted)]">
                  Your Rank: <span className="font-black text-[var(--yl-green)]">#{myRank}</span>{" "}
                  {!inTop20 && <span className="text-[#8e6a81]">(outside Top 20)</span>}
                </p>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-[var(--yl-card-border)]">
            <div className="grid grid-cols-[52px_1fr_70px_84px] bg-[var(--yl-card-bg)] px-4 py-3 text-xs font-black text-[#8a5a75]">
              <div>RANK</div>
              <div>NICK</div>
              <div>CHAR</div>
              <div className="text-right">SCORE</div>
            </div>

            {loading && mergedRows.length === 0 ? (
              <div className="px-4 py-6 text-sm font-semibold text-[#8b6178]">Loading...</div>
            ) : mergedRows.length === 0 ? (
              <div className="px-4 py-6 text-sm font-semibold text-[#8b6178]">No scores yet.</div>
            ) : (
              <div className="max-h-[360px] overflow-auto bg-white">
                {mergedRows.map((r) => {
                  const isMe =
                    myNickname && r.nickname.trim().toLowerCase() === myNickname.trim().toLowerCase();

                  return (
                    <div
                      key={`${r.rank}-${r.nickname}-${r.score}`}
                      className={`grid grid-cols-[52px_1fr_70px_84px] border-t border-[#f9d7e8] px-4 py-3 text-sm ${
                        isMe ? "bg-[#fff1f8]" : ""
                      }`}
                    >
                      <div className="font-black text-[var(--yl-primary-deep)]">{r.rank}</div>
                      <div className="truncate font-bold text-[var(--yl-ink-strong)]">
                        {r.nickname}
                        {isMe ? <span className="ml-2 text-xs font-black text-[var(--yl-green)]">YOU</span> : null}
                        {r.date ? <span className="ml-2 text-xs font-semibold text-[#ac7f95]">{r.date}</span> : null}
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold text-[var(--yl-ink-muted)]">
                        {r.character ? (
                          <img
                            src={`/${r.character}.png`}
                            alt={r.character}
                            className="h-5 w-5 rounded-full bg-white"
                            draggable={false}
                          />
                        ) : null}
                        <span className="truncate">{characterLabel(r.character)}</span>
                      </div>
                      <div className="text-right font-black text-[var(--yl-primary)]">{r.score}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-4 py-3 font-black text-[var(--yl-ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
            type="button"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
