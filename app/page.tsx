"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "./lib/gtag";
import LoginScreen, { type LoginPayload } from "./components/LoginScreen";
import HomeScreen from "./components/HomeScreen";
import Game from "./components/Game";
import LeaderboardModal, { LeaderMode, LeaderRow } from "./components/LeaderboardModal";
import { supabase } from "./lib/supabaseClient";
import { type EntryContactType } from "./lib/entry";

type CharId = "green" | "berry" | "sprinkle";
type Phase = "login" | "switchAccount" | "home" | "game";
type GameMode = "free" | "mission" | "timeAttack";

type DbRow = {
  nickname_key: string;
  nickname_display: string;
  score: number;
  updated_at: string;
  character?: CharId;
  store?: string;
};

type MyScoreRow = {
  score: number;
  nickname_display: string;
  character?: CharId | null;
  store?: string | null;
};

type EntryContact = {
  type: EntryContactType;
  value: string;
};

function normalizeNick(raw: string) {
  return raw.trim().toLowerCase();
}

function readSavedContact(): EntryContact | null {
  const type = (localStorage.getItem("entryContactType") || "").trim();
  const value = (localStorage.getItem("entryContactValue") || "").trim();
  if ((type !== "phone" && type !== "email") || !value) return null;
  return { type, value };
}

async function fetchMyBestScore(nicknameDisplay: string, selectedStore: string) {
  const key = normalizeNick(nicknameDisplay);

  try {
    let query = supabase
      .from("leaderboard_best_v2")
      .select("score,nickname_display,character,store")
      .eq("nickname_key", key)
      .order("score", { ascending: false })
      .limit(1);

    if (selectedStore !== "__ALL__") {
      query = query.eq("store", selectedStore);
    }

    const initial = await query;
    let data = (initial.data as MyScoreRow[] | null) ?? null;
    let error = initial.error;

    // Fallback attempts if first query fails
    if (error && !data) {
      const fallbacks = [
        async () => {
          let q = supabase
            .from("leaderboard_best_v2")
            .select("score,nickname_display,store")
            .eq("nickname_key", key)
            .order("score", { ascending: false })
            .limit(1);
          if (selectedStore !== "__ALL__") {
            q = q.eq("store", selectedStore);
          }
          return q;
        },
        async () => {
          let q = supabase
            .from("leaderboard_best_v2")
            .select("score,nickname_display,character")
            .eq("nickname_key", key)
            .order("score", { ascending: false })
            .limit(1);
          if (selectedStore !== "__ALL__") {
            q = q.eq("store", selectedStore);
          }
          return q;
        },
        async () => {
          let q = supabase
            .from("leaderboard_best_v2")
            .select("score,nickname_display")
            .eq("nickname_key", key)
            .order("score", { ascending: false })
            .limit(1);
          if (selectedStore !== "__ALL__") {
            q = q.eq("store", selectedStore);
          }
          return q;
        },
      ];

      for (const fallback of fallbacks) {
        const result = await fallback();
        if (!result.error && result.data) {
          data = (result.data as MyScoreRow[] | null) ?? null;
          error = null;
          break;
        }
      }
    }

    if (error) throw error;
    if (!data || data.length === 0) return undefined;

    const row = data[0];
    return {
      score: row.score,
      display: row.nickname_display,
      character: row.character ?? undefined,
      store: row.store ?? (selectedStore === "__ALL__" ? "Unknown" : selectedStore),
    };
  } catch (err) {
    console.error("Fetch best score error:", err);
    throw err;
  }
}

async function fetchMyTodayScore(nicknameDisplay: string, selectedStore: string) {
  const key = normalizeNick(nicknameDisplay);

  try {
    let query = supabase
      .from("leaderboard_best_v2")
      .select("score,nickname_display,character,store,updated_at")
      .eq("nickname_key", key)
      .gte("updated_at", startOfTodayLocalISO())
      .order("score", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(1);

    if (selectedStore !== "__ALL__") {
      query = query.eq("store", selectedStore);
    }

    const initial = await query;
    let data = (initial.data as MyScoreRow[] | null) ?? null;
    let error = initial.error;

    if (error && !data) {
      const fallbacks = [
        async () => {
          let q = supabase
            .from("leaderboard_best_v2")
            .select("score,nickname_display,store,updated_at")
            .eq("nickname_key", key)
            .gte("updated_at", startOfTodayLocalISO())
            .order("score", { ascending: false })
            .order("updated_at", { ascending: true })
            .limit(1);
          if (selectedStore !== "__ALL__") {
            q = q.eq("store", selectedStore);
          }
          return q;
        },
        async () => {
          let q = supabase
            .from("leaderboard_best_v2")
            .select("score,nickname_display,character,updated_at")
            .eq("nickname_key", key)
            .gte("updated_at", startOfTodayLocalISO())
            .order("score", { ascending: false })
            .order("updated_at", { ascending: true })
            .limit(1);
          if (selectedStore !== "__ALL__") {
            q = q.eq("store", selectedStore);
          }
          return q;
        },
        async () => {
          let q = supabase
            .from("leaderboard_best_v2")
            .select("score,nickname_display,updated_at")
            .eq("nickname_key", key)
            .gte("updated_at", startOfTodayLocalISO())
            .order("score", { ascending: false })
            .order("updated_at", { ascending: true })
            .limit(1);
          if (selectedStore !== "__ALL__") {
            q = q.eq("store", selectedStore);
          }
          return q;
        },
      ];

      for (const fallback of fallbacks) {
        const result = await fallback();
        if (!result.error && result.data) {
          data = (result.data as MyScoreRow[] | null) ?? null;
          error = null;
          break;
        }
      }
    }

    if (error) throw error;
    if (!data || data.length === 0) return undefined;

    const row = data[0];
    return {
      score: row.score,
      display: row.nickname_display,
      character: row.character ?? undefined,
      store: row.store ?? (selectedStore === "__ALL__" ? "Unknown" : selectedStore),
    };
  } catch (err) {
    console.error("Fetch today score error:", err);
    throw err;
  }
}

function startOfTodayLocalISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function todayBestStorageKey(nickname: string, store: string) {
  return `todayBest:${normalizeNick(nickname || "guest")}:${store}:${startOfTodayLocalISO().slice(0, 10)}`;
}

function allTimeBestStorageKey(nickname: string, store: string) {
  return `allTimeBest:${normalizeNick(nickname || "guest")}:${store}`;
}

function readLocalTodayBest(nickname: string, store: string) {
  const key = todayBestStorageKey(nickname, store);
  const raw = Number(localStorage.getItem(key) || 0);
  return raw > 0 ? raw : undefined;
}

function writeLocalTodayBest(nickname: string, store: string, score: number) {
  const key = todayBestStorageKey(nickname, store);
  const prev = Number(localStorage.getItem(key) || 0);
  const next = Math.max(prev, score);
  localStorage.setItem(key, String(next));
  return next;
}

function readLocalAllTimeBest(nickname: string, store: string) {
  const key = allTimeBestStorageKey(nickname, store);
  const raw = Number(localStorage.getItem(key) || 0);
  return raw > 0 ? raw : undefined;
}

function writeLocalAllTimeBest(nickname: string, store: string, score: number) {
  const key = allTimeBestStorageKey(nickname, store);
  const prev = Number(localStorage.getItem(key) || 0);
  const next = Math.max(prev, score);
  localStorage.setItem(key, String(next));
  return next;
}

function readSyncedLocalAllTimeBest(nickname: string, store: string) {
  const allTime = readLocalAllTimeBest(nickname, store) ?? 0;
  const today = readLocalTodayBest(nickname, store) ?? 0;
  if (today > allTime) {
    return writeLocalAllTimeBest(nickname, store, today);
  }
  return allTime > 0 ? allTime : undefined;
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("login");
  const [bootLoading, setBootLoading] = useState(true);
  const [character, setCharacter] = useState<CharId>("green");
  const [gameMode, setGameMode] = useState<GameMode>("free");
  const [best, setBest] = useState(0);
  const [startSignal, setStartSignal] = useState(0);
  const [authNick, setAuthNick] = useState<string | undefined>(undefined);
  const [authContactType, setAuthContactType] = useState<EntryContactType>("phone");
  const [authContactValue, setAuthContactValue] = useState<string>("");

  const [lbOpen, setLbOpen] = useState(false);
  const [lbRows, setLbRows] = useState<LeaderRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  const [mode, setMode] = useState<LeaderMode>("today");
  const selectedStore = "__ALL__";

  const [lastScore, setLastScore] = useState<number | undefined>(undefined);
  const [lastNick, setLastNick] = useState<string | undefined>(undefined);
  const [myRank, setMyRank] = useState<number | undefined>(undefined);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [rememberMeDefault, setRememberMeDefault] = useState(true);
  const [switchSourceNick, setSwitchSourceNick] = useState<string>("");
  const [switchSourceContactType, setSwitchSourceContactType] = useState<EntryContactType>("phone");
  const [switchSourceContactValue, setSwitchSourceContactValue] = useState<string>("");

  const clearClientAuthState = () => {
    localStorage.clear();
    sessionStorage.clear();
    setRememberMeDefault(false);
    setAuthNick(undefined);
    setAuthContactType("phone");
    setAuthContactValue("");
    setLastNick(undefined);
    setLastScore(undefined);
    setMyRank(undefined);
    setBest(0);
    setLbOpen(false);
    setLbRows([]);
    setLoginError(null);
    setMode("today");
  };

  const invalidateServerSession = async () => {
    await fetch("/api/entry/logout", { method: "POST" }).catch(() => undefined);
  };

  useEffect(() => {
    let active = true;

    (async () => {
      const rememberRaw = localStorage.getItem("rememberLogin");
      const rememberEnabled = rememberRaw !== "false";
      if (active) setRememberMeDefault(rememberEnabled);

      const savedNick = (localStorage.getItem("nickname") || "").trim();
      const savedContact = readSavedContact();

      if (savedNick.length >= 2 && savedNick.length <= 12) {
        if (active) setAuthNick(savedNick);
      } else if (active) {
        setAuthNick(undefined);
      }
      if (savedContact && active) {
        setAuthContactType(savedContact.type);
        setAuthContactValue(savedContact.value);
      }

      try {
        const res = await fetch("/api/entry/session", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          authenticated?: boolean;
          nickname?: string;
          contactType?: EntryContactType;
          contactValue?: string;
        };

        if (
          res.ok &&
          json.authenticated &&
          json.nickname &&
          (json.contactType === "phone" || json.contactType === "email") &&
          json.contactValue
        ) {
          localStorage.setItem("nickname", json.nickname);
          localStorage.setItem("entryContactType", json.contactType);
          localStorage.setItem("entryContactValue", json.contactValue);
          if (active) {
            setAuthNick(json.nickname);
            setAuthContactType(json.contactType);
            setAuthContactValue(json.contactValue);
            setLastNick(json.nickname);
            setPhase("home");
          }
          return;
        }
      } catch {
        // Continue with login screen fallback.
      }

      if (active) {
        setPhase("login");
      }
    })().finally(() => {
      if (active) {
        setBootLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const b = Number(localStorage.getItem("bestScore") || 0);
    setBest(b);
    setLastNick(localStorage.getItem("nickname") ?? undefined);
  }, [phase]);

  const fetchTop20 = async (m: LeaderMode, store: string) => {
    setLbLoading(true);

    try {
      const params = new URLSearchParams({
        mode: m,
        store,
      });
      if (m === "today") {
        params.set("todayFrom", startOfTodayLocalISO());
      }
      const res = await fetch(`/api/leaderboard?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        rows?: DbRow[];
      };

      setLbLoading(false);

      if (!res.ok) {
        console.error("Leaderboard error:", json.error || "Failed to load leaderboard.");
        setLbRows([]);
        return;
      }

      const list = json.rows ?? [];

      let rank = 0;
      let lastScoreLocal: number | null = null;

      const rows: LeaderRow[] = list.map((r, idx) => {
        if (lastScoreLocal === null || r.score !== lastScoreLocal) {
          rank = idx + 1;
          lastScoreLocal = r.score;
        }

        return {
          rank,
          nickname: r.nickname_display,
          score: r.score,
          date: new Date(r.updated_at).toLocaleDateString(),
          character: r.character,
        };
      });

      setLbRows(rows);
    } catch (err) {
      console.error("Leaderboard exception:", err);
      setLbLoading(false);
      setLbRows([]);
    }
  };

  const calcMyRank = async (m: LeaderMode, score: number, store: string) => {
    try {
      let query = supabase
        .from("leaderboard_best_v2")
        .select("nickname_key", { count: "exact", head: true })
        .gt("score", score);

      if (store !== "__ALL__") {
        query = query.eq("store", store);
      }

      if (m === "today") {
        query = query.gte("updated_at", startOfTodayLocalISO());
      }

      let { count, error } = await query;

      // Fallback if first query fails
      if (error && count === null) {
        let fallbackQuery = supabase
          .from("leaderboard_best_v2")
          .select("nickname_key", { count: "exact", head: true })
          .gt("score", score);

        if (store !== "__ALL__") {
          fallbackQuery = fallbackQuery.eq("store", store);
        }
        if (m === "today") {
          fallbackQuery = fallbackQuery.gte("updated_at", startOfTodayLocalISO());
        }

        const result = await fallbackQuery;
        count = result.count;
        error = result.error;
      }

      if (error) {
        console.error("Rank calculation error:", error);
        setMyRank(undefined);
        return;
      }

      setMyRank((count ?? 0) + 1);
    } catch (err) {
      console.error("Rank calculation exception:", err);
      setMyRank(undefined);
    }
  };

  const openLeaderboard = async () => {
    trackEvent({ action: "leaderboard_open", category: "engagement" });
    const nick = (localStorage.getItem("nickname") || "").trim();
    const leaderboardStore = "__ALL__";
    setLastNick(nick || undefined);

    await syncAllTimeFromLocalIfNeeded(mode, leaderboardStore, nick);
    await fetchTop20(mode, leaderboardStore);

    if (nick.length >= 2 && nick.length <= 12) {
      try {
        const mine =
          mode === "today"
            ? await fetchMyTodayScore(nick, leaderboardStore)
            : await fetchMyBestScore(nick, leaderboardStore);
        if (mine) {
          const bestScore = mine.score;
          setLastScore(bestScore);
          await calcMyRank(mode, bestScore, leaderboardStore);
        } else {
          setLastScore(undefined);
          setMyRank(undefined);
        }
      } catch (e) {
        console.error(e);
        setLastScore(undefined);
        setMyRank(undefined);
      }
    } else {
      setLastScore(undefined);
      setMyRank(undefined);
    }

    setLbOpen(true);
  };

  const upsertBestScore = async (
    nicknameDisplay: string,
    score: number,
    selectedCharacter: CharId,
    store: string,
    silent = false,
    forceWrite = false
  ) => {
    const nickname_key = normalizeNick(nicknameDisplay);
    let existingBestAllTime = 0;

    try {
      let existingQuery = supabase
        .from("leaderboard_best_v2")
        .select("score")
        .eq("nickname_key", nickname_key)
        .order("score", { ascending: false })
        .limit(1);

      if (store !== "__ALL__") {
        existingQuery = existingQuery.eq("store", store);
      }

      const { data: existingData, error: existingError } = await existingQuery;
      if (!existingError && existingData && existingData.length > 0) {
        const best = existingData[0] as { score?: number };
        existingBestAllTime = Number(best?.score ?? 0);
      }
    } catch (e) {
      console.error("Fetch existing best error:", e);
    }

    // Keep all-time records immutable unless a higher score is achieved.
    if (!forceWrite && score <= existingBestAllTime) {
      return existingBestAllTime;
    }

    const attempts = [
      () =>
        supabase.from("leaderboard_best_v2").upsert(
          [{ nickname_key, nickname_display: nicknameDisplay.trim(), score, character: selectedCharacter, store }],
          { onConflict: "nickname_key,store" }
        ),
      () =>
        supabase.from("leaderboard_best_v2").upsert(
          [{ nickname_key, nickname_display: nicknameDisplay.trim(), score, character: selectedCharacter, store }],
          { onConflict: "nickname_key" }
        ),
      () =>
        supabase.from("leaderboard_best_v2").upsert(
          [{ nickname_key, nickname_display: nicknameDisplay.trim(), score, store }],
          { onConflict: "nickname_key,store" }
        ),
      () =>
        supabase.from("leaderboard_best_v2").upsert(
          [{ nickname_key, nickname_display: nicknameDisplay.trim(), score, store }],
          { onConflict: "nickname_key" }
        ),
      () =>
        supabase.from("leaderboard_best_v2").upsert(
          [{ nickname_key, nickname_display: nicknameDisplay.trim(), score, character: selectedCharacter }],
          { onConflict: "nickname_key" }
        ),
      () =>
        supabase.from("leaderboard_best_v2").upsert(
          [{ nickname_key, nickname_display: nicknameDisplay.trim(), score }],
          { onConflict: "nickname_key" }
        ),
    ];

    let error: any = null;
    for (const attempt of attempts) {
      const res = await attempt();
      error = res.error;
      if (!error) break;
    }

    if (error) {
      const insertAttempts = [
        () =>
          supabase.from("leaderboard_best_v2").insert([
            { nickname_key, nickname_display: nicknameDisplay.trim(), score, character: selectedCharacter, store },
          ]),
        () =>
          supabase.from("leaderboard_best_v2").insert([
            { nickname_key, nickname_display: nicknameDisplay.trim(), score, store },
          ]),
        () =>
          supabase.from("leaderboard_best_v2").insert([
            { nickname_key, nickname_display: nicknameDisplay.trim(), score, character: selectedCharacter },
          ]),
        () =>
          supabase.from("leaderboard_best_v2").insert([
            { nickname_key, nickname_display: nicknameDisplay.trim(), score },
          ]),
      ];

      for (const insertAttempt of insertAttempts) {
        const insertRes = await insertAttempt();
        if (!insertRes.error) {
          error = null;
          break;
        }
        error = insertRes.error;
      }

      if (error) {
        console.error(error);
        if (!silent) {
          alert("Failed to save score.");
        }
        return undefined;
      }
    }

    return score;
  };

  const syncAllTimeFromLocalIfNeeded = async (m: LeaderMode, store: string, nick: string) => {
    if (m !== "all") return;
    if (!store.trim()) return;
    if (nick.length < 2 || nick.length > 12) return;

    const localAllTime = readSyncedLocalAllTimeBest(nick, store);
    if (localAllTime === undefined) return;

    try {
      const remote = await fetchMyBestScore(nick, store);
      const remoteBest = remote?.score ?? 0;
      if (localAllTime > remoteBest) {
        await upsertBestScore(nick, localAllTime, character, store, true);
      }
    } catch (e) {
      console.error("All-time sync error:", e);
    }
  };

  const onChangeMode = async (m: LeaderMode) => {
    setMode(m);
    const nick = (localStorage.getItem("nickname") || "").trim();
    const leaderboardStore = "__ALL__";
    await syncAllTimeFromLocalIfNeeded(m, leaderboardStore, nick);
    await fetchTop20(m, leaderboardStore);
    if (nick.length >= 2 && nick.length <= 12) {
      try {
        const mine =
          m === "today" ? await fetchMyTodayScore(nick, leaderboardStore) : await fetchMyBestScore(nick, leaderboardStore);
        if (mine) {
          const bestScore = mine.score;
          setLastScore(bestScore);
          await calcMyRank(m, bestScore, leaderboardStore);
        } else {
          setLastScore(undefined);
          setMyRank(undefined);
        }
      } catch (e) {
        console.error(e);
        setLastScore(undefined);
        setMyRank(undefined);
      }
    } else {
      setLastScore(undefined);
      setMyRank(undefined);
    }
  };

  const upsertEntryContact = async (
    contactType: EntryContactType,
    contactValue: string,
    nickname: string,
    store: string,
    rememberMe: boolean
  ) => {
    const res = await fetch("/api/entry/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactType,
        contactValue,
        nickname: nickname.trim() || null,
        store: store.trim() || null,
        rememberMe,
      }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || "Failed to save contact info.");
    }
  };

  const syncEntryScore = async (
    contactType: EntryContactType,
    contactValue: string,
    nickname: string,
    store: string,
    scoreBest: number
  ) => {
    const res = await fetch("/api/entry/score-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactType,
        contactValue,
        nickname: nickname.trim() || null,
        store: store.trim() || null,
        scoreBest,
      }),
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || "Failed to sync score.");
    }
  };

  const onLogin = async (payload: LoginPayload) => {
    const trimmed = payload.nickname.trim();
    setLoginLoading(true);
    setLoginError(null);

    const finalStore = "__ALL__";

    if (phase === "switchAccount") {
      await invalidateServerSession();
      clearClientAuthState();
    }

    try {
      await upsertEntryContact(
        payload.contactType,
        payload.contactValue,
        trimmed,
        finalStore,
        payload.rememberMe
      );
    } catch (err) {
      console.error(err);
      const message = (err as Error)?.message || "";
      if (message.includes("Nickname is already in use")) {
        setLoginError("This nickname is already used by another contact. Please choose a different nickname.");
      } else if (message.includes("Invalid contact value")) {
        setLoginError("Contact format is invalid. Please check your phone or email.");
      } else if (message.includes("Too many requests")) {
        setLoginError("Too many attempts. Please wait a moment and try again.");
      } else {
        setLoginError("Login failed while saving contact info. Please try again.");
      }
      setLoginLoading(false);
      return;
    }

    // Reset best score display to this user's own local history
    const myLocalBest = readSyncedLocalAllTimeBest(trimmed, finalStore) ?? 0;
    localStorage.setItem("bestScore", String(myLocalBest));
    setBest(myLocalBest);

    localStorage.setItem("rememberLogin", payload.rememberMe ? "true" : "false");
    if (payload.rememberMe) {
      localStorage.setItem("nickname", trimmed);
      localStorage.setItem("entryContactType", payload.contactType);
      localStorage.setItem("entryContactValue", payload.contactValue);
    } else {
      localStorage.removeItem("nickname");
      localStorage.removeItem("entryContactType");
      localStorage.removeItem("entryContactValue");
    }
    setAuthNick(trimmed);
    setAuthContactType(payload.contactType);
    setAuthContactValue(payload.contactValue);
    setLastNick(trimmed);
    setLoginError(null);
    setLoginLoading(false);
    setPhase("home");
  };

  const onChangeContact = async (payload: LoginPayload) => {
    const res = await fetch("/api/entry/contact-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: payload.nickname,
        newContactType: payload.contactType,
        newContactValue: payload.contactValue,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      contactType?: EntryContactType;
      contactValue?: string;
    };
    if (!res.ok || !json.contactType || !json.contactValue) {
      throw new Error(json.error || "Failed to change contact.");
    }

    localStorage.setItem("entryContactType", json.contactType);
    localStorage.setItem("entryContactValue", json.contactValue);
    setAuthContactType(json.contactType);
    setAuthContactValue(json.contactValue);
  };

  const submitFeedback = async () => {
    const message = feedbackText.trim();
    if (message.length < 5) {
      setFeedbackNotice("Please enter at least 5 characters.");
      return;
    }

    setFeedbackLoading(true);
    setFeedbackNotice(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          nickname: (authNick ?? localStorage.getItem("nickname") ?? "").trim() || null,
          store: selectedStore === "__ALL__" ? null : selectedStore,
          source: "home_tool",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setFeedbackNotice(json.error || "Failed to send feedback.");
        return;
      }

      trackEvent({ action: "feedback_submit", category: "engagement" });
      setFeedbackText("");
      setFeedbackNotice("Thanks! Your feedback has been submitted.");
    } catch {
      setFeedbackNotice("Failed to send feedback.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const switchAccount = async () => {
    const currentAccount = (authNick ?? localStorage.getItem("nickname") ?? "").trim();
    const savedContact = readSavedContact();
    const currentContactType = savedContact?.type ?? authContactType;
    const currentContactValue = savedContact?.value ?? authContactValue;
    setSwitchSourceNick(currentAccount || "Unknown");
    setSwitchSourceContactType(currentContactType);
    setSwitchSourceContactValue(currentContactValue);
    await invalidateServerSession();
    clearClientAuthState();
    setPhase("switchAccount");
  };

  return (
    <>
      {bootLoading ? null : (
      <main
        className={`fixed inset-0 overflow-auto bg-[radial-gradient(circle_at_15%_5%,#ffffff_0%,#ffeef8_35%,#f8d5e8_100%)] flex justify-center p-1 sm:p-3 md:p-6 ${
          phase === "game" ? "items-start sm:items-center" : "items-center"
        }`}
      >
        <div
          className={`flex w-full ${phase === "game" ? "items-start sm:items-center" : "items-center"} ${
            phase === "home"
              ? "max-w-[980px] gap-4 lg:justify-center"
              : "max-w-[430px] justify-center"
          }`}
        >
          <div
            className={`relative w-full overflow-hidden rounded-[2rem] ${
              phase === "login" || phase === "switchAccount"
                ? ""
                : "bg-white/95 shadow-[0_22px_60px_rgba(150,9,83,0.28)] ring-1 ring-[var(--yl-card-border)]"
            } ${phase === "home" ? "max-w-[390px]" : "max-w-[430px]"}`}
            style={{
              width: "100%",
              height: phase === "home" ? "min(844px, calc(100dvh - 2rem))" : "auto",
              minHeight: phase === "home" ? "min(844px, calc(100dvh - 2rem))" : "auto",
            }}
          >
            {phase === "login" && (
              <LoginScreen
                initialNickname={authNick ?? ""}
                initialContactType={authContactType}
                initialContactValue={authContactValue}
                initialRememberMe={rememberMeDefault}
                onLogin={onLogin}
                onChangeContact={onChangeContact}
                submitError={loginError}
                loading={loginLoading}
              />
            )}

            {phase === "switchAccount" && (
              <LoginScreen
                mode="switch"
                currentAccount={switchSourceNick}
                initialNickname=""
                initialContactType={switchSourceContactType}
                initialContactValue={switchSourceContactValue}
                onLogin={onLogin}
                submitError={loginError}
                loading={loginLoading}
                onCancel={() => setPhase("login")}
              />
            )}

            {phase === "home" && (
              <HomeScreen
                nickname={authNick}
                bestScore={best}
                onStart={(char: CharId, mode: GameMode) => {
                  setCharacter(char);
                  setGameMode(mode);
                  setLastNick(authNick ?? localStorage.getItem("nickname") ?? undefined);
                  setPhase("game");
                  setStartSignal((n) => n + 1);
                }}
                onOpenLeaderboard={openLeaderboard}
                onOpenAdmin={() => {
                  trackEvent({ action: "tools_open_click", category: "engagement" });
                  setToolsOpen(true);
                }}
                onSwitchAccount={switchAccount}
              />
            )}

            {phase === "game" && (
              <Game
                character={character}
                mode={gameMode}
                startSignal={startSignal}
                onExitToHome={() => setPhase("home")}
                onBestScore={(newBest: number) => {
                  setBest(newBest);
                  localStorage.setItem("bestScore", String(newBest));
                }}
                onGameOver={async (finalScore: number) => {
                  const nick = (localStorage.getItem("nickname") || "").trim();
                  const normalizedStore = "__ALL__";
                  const leaderboardMode: LeaderMode = "today";
                  const isFreePlay = gameMode === "free";

                  if (!isFreePlay) {
                    return;
                  }

                  const todayBestLocal = writeLocalTodayBest(nick || "guest", normalizedStore, finalScore);
                  setLbOpen(true);
                  setLbLoading(true);
                  setMode(leaderboardMode);
                  setLastNick(nick || "YOU");
                  setLastScore(todayBestLocal);

                  writeLocalAllTimeBest(nick || "guest", normalizedStore, finalScore);

                  if (nick.length >= 2 && nick.length <= 12) {
                    await upsertBestScore(nick, finalScore, character, normalizedStore, false, false);
                    const savedContact = readSavedContact();
                    if (savedContact) {
                      try {
                        await syncEntryScore(
                          savedContact.type,
                          savedContact.value,
                          nick,
                          normalizedStore,
                          finalScore
                        );
                      } catch (err) {
                        console.error("Failed to sync contact entry score:", err);
                      }
                    }

                    const mine = await fetchMyTodayScore(nick, "__ALL__");

                    if (mine) {
                      const bestScore = mine.score;
                      setLastScore(bestScore);
                      await calcMyRank(leaderboardMode, bestScore, "__ALL__");
                    } else {
                      setLastScore(todayBestLocal);
                      setMyRank(undefined);
                    }
                  } else {
                    setLastScore(todayBestLocal);
                    setMyRank(undefined);
                  }

                  await fetchTop20(leaderboardMode, "__ALL__");
                }}
              />
            )}
          </div>

        </div>
      </main>
      )}

      {toolsOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#2b0d1f]/45 backdrop-blur-[2px]"
            onClick={() => setToolsOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-[var(--yl-card-border)] bg-white p-5 shadow-[0_24px_50px_rgba(150,9,83,0.28)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Tools</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--yl-ink-strong)]">Admin / Feedback</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
              Choose where to go.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  trackEvent({ action: "admin_open_click", category: "engagement" });
                  window.location.href = "/admin";
                }}
                className="w-full rounded-xl bg-[var(--yl-primary)] px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                Open Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  setFeedbackNotice(null);
                  setFeedbackOpen(true);
                }}
                className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[var(--yl-card-bg)] px-4 py-3 text-sm font-black text-[var(--yl-primary)] transition hover:-translate-y-0.5"
              >
                Send Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#2b0d1f]/45 backdrop-blur-[2px]"
            onClick={() => setFeedbackOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--yl-card-border)] bg-white p-5 shadow-[0_24px_50px_rgba(150,9,83,0.28)]">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Feedback</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--yl-ink-strong)]">Tell us what to improve</h2>

            <textarea
              value={feedbackText}
              onChange={(e) => {
                setFeedbackText(e.target.value);
                if (feedbackNotice) setFeedbackNotice(null);
              }}
              maxLength={600}
              placeholder="Write your feedback here..."
              className="mt-4 h-32 w-full resize-none rounded-xl border border-[var(--yl-card-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
            />
            <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">{feedbackText.length}/600</p>

            {feedbackNotice ? (
              <p className="mt-2 text-sm font-bold text-[var(--yl-primary-deep)]">{feedbackNotice}</p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitFeedback}
                disabled={feedbackLoading}
                className="flex-1 rounded-xl bg-[var(--yl-primary)] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {feedbackLoading ? "Sending..." : "Submit"}
              </button>
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                className="rounded-xl border border-[var(--yl-card-border)] bg-white px-4 py-3 text-sm font-black text-[var(--yl-ink-muted)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <LeaderboardModal
        open={lbOpen}
        onClose={() => setLbOpen(false)}
        rows={lbRows}
        loading={lbLoading}
        myNickname={lastNick}
        myScore={lastScore}
        myRank={myRank}
        mode={mode}
        onModeChange={onChangeMode}
      />
    </>
  );
}
