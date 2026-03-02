"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type CharId = "green" | "berry" | "sprinkle";

type AdminRow = {
  nickname_key: string;
  nickname_display: string;
  score: number;
  updated_at: string;
  character?: CharId | null;
  store?: string | null;
  contact_type?: "phone" | "email" | null;
  contact_value?: string | null;
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

type Notice = {
  type: "error" | "success" | "info";
  message: string;
};

function characterLabel(character?: CharId | null) {
  if (character === "green") return "Green";
  if (character === "berry") return "Berry";
  if (character === "sprinkle") return "Sprinkle";
  return "-";
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
  const [adminToken, setAdminToken] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

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
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        rows?: AdminRow[];
        supportsStore?: boolean;
        error?: string;
        details?: string;
      };

      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthed(false);
          setAuthError("Session expired. Please log in again.");
        } else {
          setNotice({
            type: "error",
            message: json.details
              ? `${json.error || "Failed to load leaderboard records."} ${json.details}`
              : (json.error || "Failed to load leaderboard records."),
          });
        }
        setRows([]);
      } else {
        setRows(json.rows ?? []);
      }
    } catch {
      setNotice({ type: "error", message: "Failed to load leaderboard records." });
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
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        rows?: FeedbackRow[];
        error?: string;
        details?: string;
      };

      if (!res.ok) {
        if (res.status === 401) {
          setIsAuthed(false);
          setAuthError("Session expired. Please log in again.");
        } else {
          setNotice({
            type: "error",
            message: json.details
              ? `${json.error || "Failed to load feedback."} ${json.details}`
              : (json.error || "Failed to load feedback."),
          });
        }
        setFeedbackRows([]);
      } else {
        setFeedbackRows(json.rows ?? []);
      }
    } catch {
      setNotice({ type: "error", message: "Failed to load feedback." });
      setFeedbackRows([]);
    } finally {
      setFeedbackLoading(false);
    }
  };

  useEffect(() => {
    setIsAuthed(false);
    setAdminToken("");
    setAuthLoading(false);
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
        if (!term) return true;
        return (
          row.nickname_display.toLowerCase().includes(term) ||
          row.nickname_key.toLowerCase().includes(term) ||
          (row.store ?? "").toLowerCase().includes(term) ||
          (row.contact_value ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.score - a.score || a.nickname_key.localeCompare(b.nickname_key));
  }, [rows, search]);

  const totalUsers = useMemo(() => new Set(rows.map((r) => r.nickname_key)).size, [rows]);

  const deleteUserScores = async (nicknameKey: string, nicknameDisplay: string) => {
    const token = adminToken.trim();
    if (!token) {
      setNotice({ type: "error", message: "Enter admin token first." });
      return;
    }

    const deleteCount = rows.filter((r) => r.nickname_key === nicknameKey).length;
    const ok = window.confirm(
      `Delete ${deleteCount} leaderboard record(s) for "${nicknameDisplay}"?\nThis cannot be undone.`
    );
    if (!ok) return;

    const typed = window.prompt(`Type "${nicknameDisplay}" to confirm permanent deletion.`, "");
    if ((typed || "").trim() !== nicknameDisplay) {
      setNotice({ type: "info", message: "Deletion canceled. Confirmation text did not match." });
      return;
    }

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

      if (!res.ok) {
        if (res.status === 401) setIsAuthed(false);
        setNotice({ type: "error", message: "Failed to delete this user's scores." });
      } else {
        setRows((prev) => prev.filter((r) => r.nickname_key !== nicknameKey));
        setNotice({ type: "success", message: `Deleted ${deleteCount} record(s) for "${nicknameDisplay}".` });
      }
    } catch {
      setNotice({ type: "error", message: "Failed to delete this user's scores." });
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

        {notice ? (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              notice.type === "error"
                ? "border-[#efb1ca] bg-[#fff0f7] text-[#8a1f4d]"
                : notice.type === "success"
                  ? "border-[#b8eac8] bg-[#effcf3] text-[#1e6a3a]"
                  : "border-[#f0d6e6] bg-[#fff8fc] text-[#6a3b58]"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

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
                  <div className="font-semibold text-[#6a3b58]">{row.created_at ? new Date(row.created_at).toLocaleString() : "-"}</div>
                  <div className="font-semibold text-[#4e1434] break-words">{row.message?.trim() || "-"}</div>
                  <div className="truncate font-semibold text-[#5f2b4b]">{row.nickname?.trim() || "-"}</div>
                  <div className="truncate font-semibold text-[#5f2b4b]">{row.store?.trim() || "-"}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-[#f4c5dd] bg-white/90 p-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nickname / key / store / contact"
            className="w-full rounded-xl border border-[#edb8d3] bg-white px-3 py-2 text-sm font-semibold text-[#5b2041] outline-none"
          />
        </div>

        {filteredRows.length > 0 && (
          <div className="mb-4 rounded-2xl border border-[#f3c7dd] bg-white/90 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8c4a6a]">Top Snapshot</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {filteredRows.slice(0, 3).map((row, i) => (
                <div key={`${row.nickname_key}-top-${i}`} className="rounded-xl border border-[#f6d9e8] bg-[#fff7fb] px-3 py-2">
                  <p className="text-xs font-black text-[#960953]">#{i + 1}</p>
                  <p className="truncate text-sm font-black text-[#4e1434]">{row.nickname_display}</p>
                  <p className="text-xs font-semibold text-[#7d1148]">Score {row.score}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-[#f3c7dd] bg-white shadow-[0_12px_24px_rgba(150,9,83,0.12)]">
          <div className="hidden grid-cols-[68px_1.8fr_0.8fr_1fr_1fr_1.6fr_120px] bg-[#fff2f8] px-4 py-3 text-xs font-black text-[#8a5a75] lg:grid">
            <div>RANK</div>
            <div>Nickname</div>
            <div>Score</div>
            <div>Character</div>
            <div>Updated</div>
            <div>Contact</div>
            <div className="text-right">Action</div>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-sm font-semibold text-[#8b6178]">Loading records...</div>
          ) : filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-sm font-semibold text-[#8b6178]">No records found.</div>
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <div className="space-y-2 p-3 lg:hidden">
                {filteredRows.map((row, idx) => (
                  <div key={`${row.nickname_key}-${row.updated_at}-card`} className="rounded-xl border border-[#f4d5e4] bg-[#fffafd] p-3">
                    <div className="mb-2 inline-flex rounded-full border border-[#f0bfd8] bg-white px-2 py-0.5 text-[11px] font-black text-[#960953]">
                      Rank #{idx + 1}
                    </div>
                    <p className="truncate font-black text-[#4e1434]">{row.nickname_display}</p>
                    <p className="truncate text-xs font-semibold text-[#8d6280]">{row.nickname_key}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-semibold text-[#6a3b58]">
                      <div>Score: <span className="font-black text-[#7d1148]">{row.score}</span></div>
                      <div>Character: {characterLabel(row.character)}</div>
                      <div>Updated: {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "-"}</div>
                      <div className="truncate">{row.contact_type === "phone" ? "Phone" : row.contact_type === "email" ? "Email" : "Contact"}: {row.contact_value || "-"}</div>
                    </div>
                    <div className="mt-3 text-right">
                      <button
                        type="button"
                        onClick={() => void deleteUserScores(row.nickname_key, row.nickname_display)}
                        disabled={deletingKey === row.nickname_key}
                        className="rounded-lg border border-[#d94b77] bg-[#ffe9f1] px-3 py-1.5 text-xs font-black text-[#b31d53] disabled:opacity-60"
                      >
                        {deletingKey === row.nickname_key ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden lg:block">
                {filteredRows.map((row, idx) => (
                  <div key={`${row.nickname_key}-${row.updated_at}`} className="grid grid-cols-[68px_1.8fr_0.8fr_1fr_1fr_1.6fr_120px] border-t border-[#f9d7e8] px-4 py-3 text-sm">
                    <div className="font-black text-[#960953]">#{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#4e1434]">{row.nickname_display}</p>
                      <p className="truncate text-xs font-semibold text-[#8d6280]">{row.nickname_key}</p>
                    </div>
                    <div className="font-black text-[#7d1148]">{row.score}</div>
                    <div className="font-semibold text-[#5f2b4b]">{characterLabel(row.character)}</div>
                    <div className="font-semibold text-[#6a3b58]">{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "-"}</div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#5f2b4b]">{row.contact_type === "phone" ? "Phone" : row.contact_type === "email" ? "Email" : "-"}</p>
                      <p className="truncate text-xs font-semibold text-[#8d6280]">{row.contact_value || "-"}</p>
                    </div>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => void deleteUserScores(row.nickname_key, row.nickname_display)}
                        disabled={deletingKey === row.nickname_key}
                        className="rounded-lg border border-[#d94b77] bg-[#ffe9f1] px-3 py-1.5 text-xs font-black text-[#b31d53] disabled:opacity-60"
                      >
                        {deletingKey === row.nickname_key ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
