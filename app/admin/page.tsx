"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { STORE_OPTIONS } from "../lib/stores";
import StoreCombobox from "../components/StoreCombobox";

type CharId = "green" | "berry" | "sprinkle";

type AdminRow = {
  nickname_key: string;
  nickname_display: string;
  score: number;
  updated_at: string;
  character?: CharId | null;
  store?: string | null;
};

type FeedbackRow = {
  id?: number | string;
  message?: string | null;
  nickname?: string | null;
  store?: string | null;
  source?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
};

function characterLabel(character?: CharId | null) {
  if (character === "green") return "Green";
  if (character === "berry") return "Berry";
  if (character === "sprinkle") return "Sprinkle";
  return "-";
}

function normalizeStoreName(raw?: string | null) {
  return (raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export default function AdminPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("__ALL__");
  const [supportsStore, setSupportsStore] = useState(true);
  const [adminToken, setAdminToken] = useState("");

  const verifyAdminPassword = async (rawPassword: string) => {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: rawPassword }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: json.error };
  };

  const loadRows = async () => {
    const token = adminToken.trim();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/list?_ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = (await res.json()) as { rows?: AdminRow[]; supportsStore?: boolean; error?: string; details?: string };

      if (!res.ok) {
        console.error("Admin leaderboard fetch error:", json);
        if (res.status === 401) {
          setIsAuthed(false);
          setAuthError("세션이 만료되었어요. 다시 로그인해 주세요.");
        } else {
          alert(json.details ? `${json.error || "Failed to load leaderboard records."}\n${json.details}` : (json.error || "Failed to load leaderboard records."));
        }
        setRows([]);
      } else {
        setRows(json.rows ?? []);
        setSupportsStore(Boolean(json.supportsStore));
        if (!json.supportsStore) {
          setStoreFilter("__ALL__");
        }
      }
    } catch (err) {
      console.error("Admin leaderboard fetch exception:", err);
      alert("Failed to load leaderboard records.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFeedbackRows = async () => {
    const token = adminToken.trim();
    if (!token) return;

    setFeedbackLoading(true);
    try {
      const res = await fetch(`/api/admin/feedback?_ts=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = (await res.json()) as {
        rows?: FeedbackRow[];
        error?: string;
        details?: string;
      };

      if (!res.ok) {
        console.error("Admin feedback fetch error:", json);
        if (res.status === 401) {
          setIsAuthed(false);
          setAuthError("Session expired. Please log in again.");
        } else {
          alert(
            json.details
              ? `${json.error || "Failed to load feedback."}\n${json.details}`
              : (json.error || "Failed to load feedback."),
          );
        }
        setFeedbackRows([]);
      } else {
        setFeedbackRows(json.rows ?? []);
      }
    } catch (err) {
      console.error("Admin feedback fetch exception:", err);
      alert("Failed to load feedback.");
      setFeedbackRows([]);
    } finally {
      setFeedbackLoading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      // Always require password entry on each admin page visit.
      setIsAuthed(false);
      setAdminToken("");
      setAuthLoading(false);
    };

    void boot();
  }, []);

  useEffect(() => {
    if (!isAuthed || !adminToken.trim()) return;
    void loadRows();
    void loadFeedbackRows();
  }, [isAuthed, adminToken]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        const normalizedStore = normalizeStoreName(row.store);
        const normalizedFilter = normalizeStoreName(storeFilter);
        const storeOk =
          !supportsStore || storeFilter === "__ALL__" || normalizedStore === normalizedFilter;
        if (!storeOk) return false;
        if (!term) return true;
        return (
          row.nickname_display.toLowerCase().includes(term) ||
          row.nickname_key.toLowerCase().includes(term) ||
          (row.store ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.score - a.score || a.nickname_key.localeCompare(b.nickname_key));
  }, [rows, search, storeFilter]);

  const storeChoices = useMemo(() => {
    const fromRows = Array.from(new Set(rows.map((r) => (r.store ?? "").trim()).filter(Boolean)));
    const merged = Array.from(new Set([...STORE_OPTIONS, ...fromRows]));
    return merged.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const totalUsers = useMemo(() => new Set(rows.map((r) => r.nickname_key)).size, [rows]);

  const isStoreFiltered = supportsStore && storeFilter !== "__ALL__";

  const storeSummaries = useMemo(() => {
    const grouped = new Map<string, { count: number; topScore: number; totalScore: number }>();
    for (const row of rows) {
      const storeName = (row.store ?? "").trim() || "__UNKNOWN__";
      const prev = grouped.get(storeName) ?? { count: 0, topScore: Number.NEGATIVE_INFINITY, totalScore: 0 };
      prev.count += 1;
      prev.topScore = Math.max(prev.topScore, row.score ?? 0);
      prev.totalScore += row.score ?? 0;
      grouped.set(storeName, prev);
    }

    return Array.from(grouped.entries())
      .map(([store, v]) => ({
        store,
        count: v.count,
        topScore: Number.isFinite(v.topScore) ? v.topScore : 0,
        avgScore: v.count > 0 ? Math.round((v.totalScore / v.count) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count || b.topScore - a.topScore || a.store.localeCompare(b.store));
  }, [rows]);

  const deleteUserScores = async (nicknameKey: string, nicknameDisplay: string) => {
    const token = adminToken.trim();
    if (!token) {
      alert("Enter admin token first.");
      return;
    }

    const ok = window.confirm(
      `Delete all leaderboard scores for "${nicknameDisplay}"?\nThis cannot be undone.`
    );
    if (!ok) return;

    setDeletingKey(nicknameKey);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nicknameKey }),
      });

      const json = (await res.json()) as { error?: string };

      if (!res.ok) {
        console.error("Delete user score error:", json);
        if (res.status === 401) {
          setIsAuthed(false);
        }
        alert("Failed to delete this user's scores.");
      } else {
        setRows((prev) => prev.filter((r) => r.nickname_key !== nicknameKey));
      }
    } catch (err) {
      console.error("Delete user score exception:", err);
      alert("Failed to delete this user's scores.");
    } finally {
      setDeletingKey(null);
    }
  };

  const onSubmitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError("");
    const trimmed = password.trim();
    if (!trimmed) {
      setAuthError("Enter admin password.");
      return;
    }

    setAuthLoading(true);
    try {
      const result = await verifyAdminPassword(trimmed);
      if (!result.ok) {
        setAuthError(result.error || "Invalid password.");
        setAuthLoading(false);
        return;
      }
      setAdminToken(trimmed);
      setIsAuthed(true);
      setPassword("");
    } catch {
      setAuthError("Failed to verify password.");
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-6">
        <div className="mx-auto max-w-md">
          <div className="rounded-3xl border border-[#f4c5dd] bg-white/90 p-6 shadow-[0_16px_36px_rgba(150,9,83,0.15)]">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#960953]">Admin</p>
            <h1 className="mt-1 text-2xl font-black text-[#4b0b31]">Enter Password</h1>

            <form onSubmit={onSubmitPassword} className="mt-4 space-y-3">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                className="w-full rounded-xl border border-[#edb8d3] bg-white px-3 py-2 text-sm font-semibold text-[#5b2041] outline-none"
              />
              <label className="flex items-center gap-2 text-sm font-semibold text-[#6b3551]">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                Show password
              </label>
              {authError ? <p className="text-sm font-bold text-[#b42357]">{authError}</p> : null}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="rounded-full bg-[linear-gradient(135deg,#960953,#c54b86)] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                >
                  {authLoading ? "Checking..." : "Enter Admin"}
                </button>
                <Link
                  href="/"
                  className="rounded-full border border-[#f2bad5] bg-white px-4 py-2 text-sm font-black text-[#960953]"
                >
                  Back to Game
                </Link>
              </div>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,#ffffff_0%,#ffedf7_36%,#f9d3e7_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-[#f4c5dd] bg-white/85 p-4 shadow-[0_16px_36px_rgba(150,9,83,0.15)]">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#960953]">Admin</p>
            <h1 className="text-2xl font-black text-[#4b0b31]">Leaderboard Manager</h1>
            <p className="text-sm font-semibold text-[#7f4a66]">View and delete user scores quickly.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void loadRows();
                void loadFeedbackRows();
              }}
              className="rounded-full border border-[#f2bad5] bg-white px-4 py-2 text-sm font-black text-[#960953]"
            >
              Refresh
            </button>
            <Link
              href="/"
              className="rounded-full bg-[linear-gradient(135deg,#960953,#c54b86)] px-4 py-2 text-sm font-black text-white"
            >
              Back to Game
            </Link>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#f4c5dd] bg-white/90 p-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#8c4a6a]">Total Records</p>
            <p className="mt-1 text-2xl font-black text-[#4b0b31]">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-[#f4c5dd] bg-white/90 p-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#8c4a6a]">Total Users</p>
            <p className="mt-1 text-2xl font-black text-[#4b0b31]">{totalUsers}</p>
          </div>
          <div className="rounded-2xl border border-[#f4c5dd] bg-white/90 p-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#8c4a6a]">Visible Rows</p>
            <p className="mt-1 text-2xl font-black text-[#4b0b31]">{filteredRows.length}</p>
          </div>
        </div>

        <div className="mb-4 overflow-hidden rounded-2xl border border-[#f3c7dd] bg-white shadow-[0_12px_24px_rgba(150,9,83,0.12)]">
          <div className="bg-[linear-gradient(135deg,#fff1f8,#f8c8df)] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#960953]">User Feedback</p>
          </div>
          <div className="grid grid-cols-[120px_1fr_130px_130px] bg-[#fff2f8] px-4 py-2 text-xs font-black text-[#8a5a75]">
            <div>DATE</div>
            <div>MESSAGE</div>
            <div>NICKNAME</div>
            <div>STORE</div>
          </div>
          {feedbackLoading ? (
            <div className="px-4 py-6 text-sm font-semibold text-[#8b6178]">Loading feedback...</div>
          ) : feedbackRows.length === 0 ? (
            <div className="px-4 py-6 text-sm font-semibold text-[#8b6178]">No feedback yet.</div>
          ) : (
            <div className="max-h-72 overflow-auto">
              {feedbackRows.map((row, idx) => (
                <div
                  key={`${row.id ?? "feedback"}-${idx}`}
                  className="grid grid-cols-[120px_1fr_130px_130px] gap-3 border-t border-[#f9d7e8] px-4 py-3 text-sm"
                >
                  <div className="font-semibold text-[#6a3b58]">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                  </div>
                  <div className="font-semibold text-[#4e1434] break-words">
                    {row.message?.trim() || "-"}
                  </div>
                  <div className="truncate font-semibold text-[#5f2b4b]">
                    {row.nickname?.trim() || "-"}
                  </div>
                  <div className="truncate font-semibold text-[#5f2b4b]">
                    {row.store?.trim() || "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 overflow-hidden rounded-2xl border border-[#f3c7dd] bg-white shadow-[0_12px_24px_rgba(150,9,83,0.12)]">
          <div className="bg-[linear-gradient(135deg,#fff1f8,#f8c8df)] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#960953]">Store Summary</p>
          </div>
          <div className="grid grid-cols-[1.8fr_80px_100px_100px_90px] bg-[#fff2f8] px-4 py-2 text-xs font-black text-[#8a5a75]">
            <div>STORE</div>
            <div className="text-right">ROWS</div>
            <div className="text-right">TOP</div>
            <div className="text-right">AVG</div>
            <div className="text-right">VIEW</div>
          </div>
          {storeSummaries.length === 0 ? (
            <div className="px-4 py-6 text-sm font-semibold text-[#8b6178]">No store data.</div>
          ) : (
            <div className="max-h-56 overflow-auto">
              {storeSummaries.map((s) => (
                <div
                  key={s.store}
                  className="grid grid-cols-[1.8fr_80px_100px_100px_90px] items-center border-t border-[#f9d7e8] px-4 py-2 text-sm"
                >
                  <div className="truncate font-black text-[#4e1434]">{s.store}</div>
                  <div className="text-right font-semibold text-[#6b3a58]">{s.count}</div>
                  <div className="text-right font-black text-[#7d1148]">{s.topScore}</div>
                  <div className="text-right font-semibold text-[#6b3a58]">{s.avgScore}</div>
                  <div className="text-right">
                    <button
                      type="button"
                      disabled={!supportsStore || s.store === "__UNKNOWN__"}
                      onClick={() => {
                        if (!supportsStore || s.store === "__UNKNOWN__") return;
                        setSearch("");
                        setStoreFilter(s.store);
                      }}
                      className="rounded-lg border border-[#edb8d3] bg-white px-2 py-1 text-xs font-black text-[#960953] disabled:opacity-40"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-[#f4c5dd] bg-white/90 p-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nickname / key / store"
            className="w-full rounded-xl border border-[#edb8d3] bg-white px-3 py-2 text-sm font-semibold text-[#5b2041] outline-none"
          />
          <div className="flex shrink-0 items-center gap-2 sm:w-[280px]">
            <button
              type="button"
              disabled={!supportsStore}
              onClick={() => {
                if (!supportsStore) return;
                setSearch("");
                setStoreFilter("__ALL__");
              }}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-black transition disabled:opacity-40 ${
                storeFilter === "__ALL__"
                  ? "bg-[#960953] text-white"
                  : "border border-[#edb8d3] bg-white text-[#5b2041]"
              }`}
            >
              All
            </button>
            <StoreCombobox
              stores={storeChoices}
              value={storeFilter === "__ALL__" ? "" : storeFilter}
              onChange={(store) => {
                if (!supportsStore) return;
                const nextStore = store || "__ALL__";
                setSearch("");
                setStoreFilter(nextStore);
              }}
              placeholder="Search store…"
              wrapperClassName="min-w-0 flex-1"
              inputClassName="w-full rounded-xl border border-[#edb8d3] bg-white px-3 py-2 text-sm font-semibold text-[#5b2041] outline-none"
            />
          </div>
        </div>
        {!supportsStore && (
          <p className="mb-4 text-sm font-semibold text-[#8d6280]">
            현재 배포 DB에는 매장 컬럼이 없어 매장별 필터를 적용할 수 없습니다.
          </p>
        )}

        {/* Store leaderboard view — shown when a specific store is selected */}
        {isStoreFiltered && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-[#f3c7dd] bg-white shadow-[0_12px_24px_rgba(150,9,83,0.12)]">
            <div className="bg-[linear-gradient(135deg,#fff1f8,#f8c8df)] px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#960953]">Store Leaderboard</p>
              <p className="mt-0.5 truncate text-base font-black text-[#4b0b31]">{storeFilter}</p>
              <p className="text-xs font-semibold text-[#7f4a66]">{filteredRows.length} players · ranked by score</p>
            </div>
            <div className="grid grid-cols-[44px_1fr_80px_100px] bg-[#fff2f8] px-4 py-2 text-xs font-black text-[#8a5a75]">
              <div>RANK</div>
              <div>NICKNAME</div>
              <div className="text-right">SCORE</div>
              <div className="text-right">ACTION</div>
            </div>
            {loading ? (
              <div className="px-4 py-8 text-sm font-semibold text-[#8b6178]">Loading...</div>
            ) : filteredRows.length === 0 ? (
              <div className="px-4 py-8 text-sm font-semibold text-[#8b6178]">No players found for this store.</div>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                {filteredRows.map((row, idx) => {
                  const rank = idx === 0 || filteredRows[idx - 1].score !== row.score ? idx + 1 : null;
                  const displayRank = rank ?? "·";
                  const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                  return (
                    <div
                      key={`${row.nickname_key}-${row.store ?? "-"}`}
                      className={`grid grid-cols-[44px_1fr_80px_100px] items-center border-t border-[#f9d7e8] px-4 py-3 ${
                        idx < 3 ? "bg-[#fffcfe]" : ""
                      }`}
                    >
                      <div className="text-sm font-black text-[#6b1f49]">
                        {medal ?? <span className="text-[#8d6280]">{displayRank}</span>}
                      </div>
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-black text-[#4e1434]">{row.nickname_display}</p>
                        <p className="truncate text-[11px] font-semibold text-[#a07090]">
                          {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : ""}
                        </p>
                      </div>
                      <div className="text-right text-lg font-black text-[#960953]">{row.score}</div>
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => void deleteUserScores(row.nickname_key, row.nickname_display)}
                          disabled={deletingKey === row.nickname_key}
                          className="rounded-lg bg-[#cb225e] px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
                        >
                          {deletingKey === row.nickname_key ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Full admin table — always shown */}
        <div className="overflow-hidden rounded-2xl border border-[#f3c7dd] bg-white shadow-[0_12px_24px_rgba(150,9,83,0.12)]">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] bg-[#fff2f8] px-4 py-3 text-xs font-black text-[#8a5a75]">
            <div>Nickname</div>
            <div>Score</div>
            <div>Store</div>
            <div>Character</div>
            <div>Updated</div>
            <div className="text-right">Action</div>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-sm font-semibold text-[#8b6178]">Loading records...</div>
          ) : filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-sm font-semibold text-[#8b6178]">No records found.</div>
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              {filteredRows.map((row, idx) => (
                <div
                  key={`${row.nickname_key}-${row.store ?? "-"}-${row.updated_at}`}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] border-t border-[#f9d7e8] px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black text-[#4e1434]">
                      <span className="mr-1.5 text-xs font-semibold text-[#b08090]">#{idx + 1}</span>
                      {row.nickname_display}
                    </p>
                    <p className="truncate text-xs font-semibold text-[#8d6280]">{row.nickname_key}</p>
                  </div>
                  <div className="font-black text-[#7d1148]">{row.score}</div>
                  <div className="truncate font-semibold text-[#5f2b4b]">{row.store ?? "-"}</div>
                  <div className="font-semibold text-[#5f2b4b]">{characterLabel(row.character)}</div>
                  <div className="font-semibold text-[#6a3b58]">
                    {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "-"}
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => void deleteUserScores(row.nickname_key, row.nickname_display)}
                      disabled={deletingKey === row.nickname_key}
                      className="rounded-lg bg-[#cb225e] px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
                    >
                      {deletingKey === row.nickname_key ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
