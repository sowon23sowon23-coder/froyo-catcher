"use client";

import { useEffect, useRef, useState } from "react";

import QRCode from "qrcode";
import { formatCurrency, formatDateTime } from "../lib/couponMvp";
import { dallasWallTimeToUtc } from "../lib/dallasTime";
import { resolveGameAccessState, type GameAccessConfig, type GameAccessState } from "../lib/gameAccess";

// ??? Types ???????????????????????????????????????????????????????????????????

type DashboardStats = {
  filter?: { mode: "latest" | "day" | "range"; date: string | null; startDate: string | null; endDate: string | null };
  coupons: {
    issued: number;
    redeemed: number;
    expired: number;
    active: number;
    redeemRate: number;
    issuanceLimit?: { type: "daily" | "campaign"; max: number; current: number; percentUsed: number; stopOnReach: boolean } | null;
  };
  game: {
    totalSessions: number;
    completedSessions: number;
    completionRate: number;
    couponIssuedFromGame: number;
    couponUpdatesFromGame?: number;
    gameToConversionRate: number;
  };
  funnel: Array<{ label: string; value: number }>;
  charts: { issuedByDay: Array<{ date: string; count: number }>; redeemedByDay: Array<{ date: string; count: number }> };
  recentRedeems: Array<{ id: number; action_type: string; store_id: string | null; created_at: string }>;
};

type GameAnalytics = {
  filter?: { mode: "latest" | "day" | "range"; date: string | null; startDate: string | null; endDate: string | null };
  totalSessions: number;
  avgScore: number;
  avgPlayTimeSec: number | null;
  couponIssuedCount: number;
  couponIssuedRate: number;
  scoreDistribution: Array<{ range: string; count: number }>;
  scoreByMode: Array<{ mode: string; avgScore: number; count: number }>;
  sessionsByDay: Array<{ date: string; count: number }>;
  recentSessions: Array<{ score: number; mode: string; nickname_key: string | null; coupon_issued: boolean; created_at: string }>;
};

type StoreStats = {
  filter?: { mode: "latest" | "day" | "range"; date: string | null; startDate: string | null; endDate: string | null };
  totals: { issued: number; redeemed: number; usageRate: number };
  statusCounts: { unused: number; used: number; expired: number };
  storeUsage: Array<{ storeId: string; count: number }>;
  recentLogs: Array<{ id: number; code: string; action_type: string; reason: string; store_id: string | null; staff_id: string | null; created_at: string }>;
  charts: { issuedByDay: Array<{ date: string; count: number }>; redeemedByDay: Array<{ date: string; count: number }> };
};

type WalletCoupon = { id: number; title: string; reward_type: string; status: string; expires_at: string; created_at: string; redeemed_at: string | null };
type UserEntry = { id: number; nickname_display: string; nickname_key: string; contact_type: string | null; contact_value: string | null; created_at: string; walletCoupons: WalletCoupon[] };
type FeedbackRow = { id: number; message: string; nickname: string | null; store: string | null; source: string | null; created_at: string };

type CouponRewardTier = { threshold: number; discountPercent: number; fixedQrValue?: string | null; active?: boolean };
type CouponSettings = {
  issuanceLimit: {
    type: "daily" | "campaign";
    max: number;
    stopOnReach: boolean;
    enabled?: boolean;
    dailyStartTime?: string | null;
    dailyEndTime?: string | null;
    campaignStartDate?: string | null;
    campaignStartTime?: string | null;
    campaignEndDate?: string | null;
    campaignEndTime?: string | null;
    soldOutMessage?: string | null;
  } | null;
  rewardTiers: CouponRewardTier[];
  issuanceStats: { dailyIssued: number; campaignIssued: number; currentIssued: number; percentUsed: number; completedAt?: string | null };
  history?: Array<{ id: number; changed_by: string | null; changes: unknown; created_at: string }>;
};

type NavItem = "dashboard" | "couponSettings" | "game" | "users" | "feedback" | "logs" | "gameSettings";
type DashboardFilter = { mode: "latest" | "day" | "range"; date: string; startDate: string; endDate: string };

function parseCampaignDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function parseCampaignTimeParts(time: string | null | undefined, fallbackHour: number, fallbackMinute: number) {
  if (!time) return { hour: fallbackHour, minute: fallbackMinute };
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return { hour: fallbackHour, minute: fallbackMinute };
  return { hour, minute };
}

function getCampaignBoundaryMs(dateValue: string | null | undefined, timeValue: string | null | undefined, endOfDayFallback: boolean) {
  if (!dateValue) return null;
  const date = parseCampaignDateParts(dateValue);
  if (!date) return null;
  if (endOfDayFallback && !timeValue) {
    return dallasWallTimeToUtc(date.year, date.month, date.day + 1).getTime();
  }
  const time = parseCampaignTimeParts(timeValue, 0, 0);
  return dallasWallTimeToUtc(date.year, date.month, date.day, time.hour, time.minute).getTime();
}

function formatCampaignPeriod(dateValue: string | null | undefined, timeValue: string | null | undefined) {
  if (!dateValue) return "—";
  return timeValue ? `${dateValue} ${timeValue}` : dateValue;
}

function getCampaignDeadlineMs(endDate: string | null | undefined, endTime: string | null | undefined) {
  if (!endDate) return null;
  return getCampaignBoundaryMs(endDate, endTime, true);
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Ended";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return days > 0
    ? `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    : `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function buildPeriodQuery(filter: DashboardFilter) {
  const params = new URLSearchParams();
  if (filter.mode === "day" && filter.date) {
    params.set("mode", "day");
    params.set("date", filter.date);
  }
  if (filter.mode === "range" && filter.startDate && filter.endDate) {
    params.set("mode", "range");
    params.set("startDate", filter.startDate);
    params.set("endDate", filter.endDate);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildPeriodCsvHref(path: string, filter: DashboardFilter) {
  const params = new URLSearchParams({ format: "csv" });
  if (filter.mode === "day" && filter.date) {
    params.set("mode", "day");
    params.set("date", filter.date);
  }
  if (filter.mode === "range" && filter.startDate && filter.endDate) {
    params.set("mode", "range");
    params.set("startDate", filter.startDate);
    params.set("endDate", filter.endDate);
  }
  return `${path}?${params.toString()}`;
}

// ??? Main Component ???????????????????????????????????????????????????????????

export default function AdminDashboardClient() {
  const NAV_ITEMS: NavItem[] = ["dashboard", "gameSettings", "couponSettings", "users", "logs", "game", "feedback"];
  const savedNav = typeof window !== "undefined" ? localStorage.getItem("adminNav") : null;
  const [nav, setNav] = useState<NavItem>(NAV_ITEMS.includes(savedNav as NavItem) ? (savedNav as NavItem) : "dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Dashboard
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>({ mode: "latest", date: "", startDate: "", endDate: "" });

  // Game analytics
  const [gameData, setGameData] = useState<GameAnalytics | null>(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameAccessConfig, setGameAccessConfig] = useState<GameAccessConfig | null>(null);
  const [gameAccessState, setGameAccessState] = useState<GameAccessState | null>(null);
  const [gameSettingsLoading, setGameSettingsLoading] = useState(false);
  const [gameSettingsSaving, setGameSettingsSaving] = useState(false);

  // Coupon settings
  const [couponSettings, setCouponSettings] = useState<CouponSettings | null>(null);
  const [couponSettingsLoading, setCouponSettingsLoading] = useState(false);
  const [couponSettingsSaving, setCouponSettingsSaving] = useState(false);

  // Store / logs
  const [storeStats, setStoreStats] = useState<StoreStats | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);

  // User search
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserEntry[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [expiringId, setExpiringId] = useState<number | null>(null);

  // Feedback
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);

  const loadedRef = useRef<Partial<Record<NavItem, boolean>>>({});

  // ?? Loaders ?????????????????????????????????????????????????????????????????

  const loadDashboard = async () => {
    setDashLoading(true);
    try {
      const query = buildPeriodQuery(dashboardFilter);
      const res = await fetch(`/api/admin/dashboard-stats${query}`, { cache: "no-store" });
      setDashStats((await res.json()) as DashboardStats);
      loadedRef.current.dashboard = true;
    } finally { setDashLoading(false); }
  };

  const loadGame = async () => {
    setGameLoading(true);
    try {
      const query = buildPeriodQuery(dashboardFilter);
      const res = await fetch(`/api/admin/game-analytics${query}`, { cache: "no-store" });
      setGameData((await res.json()) as GameAnalytics);
      loadedRef.current.game = true;
    } finally { setGameLoading(false); }
  };

  const loadGameSettings = async () => {
    setGameSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/game-config", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { config?: GameAccessConfig; state?: GameAccessState; error?: string };
      if (!res.ok || json.error) { setNotice(json.error || "Failed to load game settings."); return; }
      const config = json.config ?? resolveGameAccessState(null).config;
      setGameAccessConfig(config);
      setGameAccessState(json.state ?? resolveGameAccessState(config));
      loadedRef.current.gameSettings = true;
    } finally { setGameSettingsLoading(false); }
  };

  const saveGameSettings = async (config: GameAccessConfig) => {
    const state = resolveGameAccessState(config);
    if (config.mode === "scheduled" && state.startsAt && state.endsAt && state.startsAt >= state.endsAt) {
      setNotice("Game start time must be before the end time.");
      return;
    }

    setGameSettingsSaving(true);
    try {
      const res = await fetch("/api/admin/game-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_access: config }),
      });
      const json = (await res.json().catch(() => ({}))) as { config?: GameAccessConfig; state?: GameAccessState; error?: string };
      if (!res.ok || json.error || !json.config) { setNotice(json.error || "Failed to save game settings."); return; }
      setGameAccessConfig(json.config);
      setGameAccessState(json.state ?? resolveGameAccessState(json.config));
      setNotice("Game settings saved.");
      loadedRef.current.dashboard = false;
      loadedRef.current.game = false;
    } finally { setGameSettingsSaving(false); }
  };

  const loadCouponSettings = async () => {
    setCouponSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/coupon-config", { cache: "no-store" });
      const json = (await res.json()) as CouponSettings & { error?: string };
      if (json.error) { setNotice(json.error); return; }
      setCouponSettings(json);
      loadedRef.current.couponSettings = true;
    } finally { setCouponSettingsLoading(false); }
  };

  const loadStore = async () => {
    setStoreLoading(true);
    try {
      const query = buildPeriodQuery(dashboardFilter);
      const res = await fetch(`/api/admin/stats${query}`, { cache: "no-store" });
      setStoreStats((await res.json()) as StoreStats);
      loadedRef.current.logs = true;
    } finally { setStoreLoading(false); }
  };

  const loadFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/admin/feedback-view", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { rows?: FeedbackRow[]; error?: string; details?: string };
      if (!res.ok || json.error) {
        setFeedbackRows([]);
        setNotice(json.details || json.error || "Failed to load feedback.");
        return;
      }
      setFeedbackRows(json.rows ?? []);
      setFeedbackLoaded(true);
      loadedRef.current.feedback = true;
    } finally { setFeedbackLoading(false); }
  };

  const saveCouponSettings = async (nextSettings: CouponSettings) => {
    const limit = nextSettings.issuanceLimit;
    if (!limit || !Number.isInteger(limit.max) || limit.max < 1) {
      setNotice("Enter a valid issuance limit.");
      return;
    }
    if (limit.type === "campaign" && limit.campaignStartDate && limit.campaignEndDate) {
      const campaignStartMs = getCampaignBoundaryMs(limit.campaignStartDate, limit.campaignStartTime, false);
      const campaignEndMs = getCampaignBoundaryMs(limit.campaignEndDate, limit.campaignEndTime, true);
      if (campaignStartMs !== null && campaignEndMs !== null && campaignStartMs >= campaignEndMs) {
        setNotice("Campaign start date must be before the end date.");
        return;
      }
    }
    if (nextSettings.rewardTiers.length < 1) {
      setNotice("At least one reward tier is required.");
      return;
    }
    const thresholds = new Set<number>();
    for (const tier of nextSettings.rewardTiers) {
      if (!Number.isInteger(tier.threshold) || tier.threshold < 1) {
        setNotice("Tier score thresholds must be whole numbers over 0.");
        return;
      }
      if (!Number.isInteger(tier.discountPercent) || tier.discountPercent < 1 || tier.discountPercent > 100) {
        setNotice("Discount rates must be whole numbers from 1 to 100.");
        return;
      }
      if (thresholds.has(tier.threshold)) {
        setNotice("Score thresholds cannot be duplicated.");
        return;
      }
      thresholds.add(tier.threshold);
    }
    const sortedForSafety = nextSettings.rewardTiers.filter((tier) => tier.active !== false).sort((a, b) => b.threshold - a.threshold);
    for (let i = 1; i < sortedForSafety.length; i += 1) {
      if (sortedForSafety[i]!.discountPercent > sortedForSafety[i - 1]!.discountPercent) {
        setNotice("Higher score tiers should not have lower discounts than lower score tiers.");
        return;
      }
    }

    setCouponSettingsSaving(true);
    try {
      const sortedTiers = [...nextSettings.rewardTiers].sort((a, b) => b.threshold - a.threshold);
      const res = await fetch("/api/admin/coupon-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuance_limit: limit,
          reward_tiers: sortedTiers,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as CouponSettings & { error?: string };
      if (!res.ok || json.error) { setNotice(json.error || "Failed to save coupon settings."); return; }
      setCouponSettings(json);
      setNotice("Coupon settings saved.");
      loadedRef.current.dashboard = false;
    } finally { setCouponSettingsSaving(false); }
  };

  const searchUsers = async () => {
    const q = userQuery.trim();
    if (q.length < 2) { setNotice("Enter at least 2 characters for the nickname."); return; }
    setUserSearchLoading(true);
    setUserResults([]);
    try {
      const res = await fetch(`/api/admin/user-wallet?nickname=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = (await res.json()) as { entries?: UserEntry[]; error?: string };
      if (json.error) { setNotice(json.error); return; }
      setUserResults(json.entries ?? []);
      if ((json.entries ?? []).length === 0) setNotice("No search results found.");
    } finally { setUserSearchLoading(false); }
  };

  const expireWalletCoupon = async (couponId: number, entryId: number) => {
    setExpiringId(couponId);
    try {
      const res = await fetch("/api/admin/wallet-expire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletCouponId: couponId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.error) { setNotice(json.error); return; }
      setNotice("The coupon has been marked as expired.");
      setUserResults((prev) =>
        prev.map((u) => u.id !== entryId ? u : {
          ...u,
          walletCoupons: u.walletCoupons.map((c) => c.id === couponId ? { ...c, status: "expired" } : c),
        }),
      );
    } finally { setExpiringId(null); }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login?next=/admin";
  };

  useEffect(() => {
    if (nav === "dashboard") {
      void loadDashboard();
      return;
    }
    if (nav === "game") {
      void loadGame();
      return;
    }
    if (nav === "logs") {
      void loadStore();
      return;
    }
    if (!loadedRef.current[nav]) {
      if (nav === "couponSettings") void loadCouponSettings();
      if (nav === "gameSettings") void loadGameSettings();
      if (nav === "feedback") void loadFeedback();
    }
  }, [nav, dashboardFilter]);

  useEffect(() => {
    if (nav !== "dashboard") return;
    const intervalId = window.setInterval(() => {
      void loadDashboard();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [nav, dashboardFilter]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const clearAdminSession = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/auth/logout");
        return;
      }
      void fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(() => undefined);
    };

    window.addEventListener("pagehide", clearAdminSession);
    return () => window.removeEventListener("pagehide", clearAdminSession);
  }, []);

  // ?? Nav config ???????????????????????????????????????????????????????????????

  const navItems: { id: NavItem; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "#" },
    { id: "gameSettings", label: "Game Settings", icon: "!" },
    { id: "couponSettings", label: "Coupon Settings", icon: "*" },
    { id: "users", label: "Players", icon: "@" },
    { id: "logs", label: "Coupon Logs", icon: "=" },
    { id: "game", label: "Games", icon: "G" },
    { id: "feedback", label: "Feedback", icon: "~" },
  ];

  // ?? Render ???????????????????????????????????????????????????????????????????

  return (
    <div className="flex min-h-screen bg-[#fff8f3]">
      {/* Toast */}
      {notice ? (
        <div className="fixed left-1/2 top-4 z-[200] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[#f2d9d0] bg-white px-4 py-3 text-center text-sm font-black text-[#7f4854] shadow-lg">
          {notice}
        </div>
      ) : null}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[#f0ddd8] bg-white shadow-[4px_0_20px_rgba(158,108,87,0.08)] transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="border-b border-[#f0ddd8] px-5 py-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ec7d5d]">Yogurtland</p>
          <p className="text-lg font-black text-[#4f2832]">Admin Portal</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setNav(item.id); localStorage.setItem("adminNav", item.id); setSidebarOpen(false); }}
              className={`flex w-full items-center gap-3 px-5 py-3 text-sm font-black transition ${
                nav === item.id
                  ? "bg-[linear-gradient(135deg,#fff1eb,#ffddd4)] text-[#c0502a]"
                  : "text-[#8a6670] hover:bg-[#fff8f3]"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[#f0ddd8] p-4">
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded-2xl bg-[#4f2832] py-2.5 text-sm font-black text-white"
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex items-center justify-between border-b border-[#f0ddd8] bg-white px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-xl text-[#4f2832]">Menu</button>
          <span className="font-black text-[#4f2832]">{navItems.find((n) => n.id === nav)?.label}</span>
          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {nav === "dashboard" && <DashboardSection data={dashStats} loading={dashLoading} filter={dashboardFilter} onFilterChange={setDashboardFilter} onRefresh={loadDashboard} />}
          {nav === "gameSettings" && <GameSettingsSection config={gameAccessConfig} state={gameAccessState} loading={gameSettingsLoading} saving={gameSettingsSaving} onChange={setGameAccessConfig} onSave={saveGameSettings} onRefresh={loadGameSettings} />}
          {nav === "game" && <GameSection data={gameData} loading={gameLoading} filter={dashboardFilter} onFilterChange={setDashboardFilter} onRefresh={loadGame} />}
          {nav === "users" && <UserSection query={userQuery} results={userResults} loading={userSearchLoading} expiringId={expiringId} onQueryChange={setUserQuery} onSearch={searchUsers} onExpire={expireWalletCoupon} />}
          {nav === "logs" && <LogsSection data={storeStats} loading={storeLoading} filter={dashboardFilter} onFilterChange={setDashboardFilter} onRefresh={loadStore} />}
          {nav === "feedback" && <FeedbackSection rows={feedbackRows} loading={feedbackLoading} onRefresh={loadFeedback} />}
          {nav === "couponSettings" && <CouponSettingsSection settings={couponSettings} loading={couponSettingsLoading} saving={couponSettingsSaving} onChange={setCouponSettings} onSave={saveCouponSettings} onRefresh={loadCouponSettings} />}
        </main>
      </div>
    </div>
  );
}

// ??? Section: Dashboard ???????????????????????????????????????????????????????

function DashboardSection({ data, loading, filter, onFilterChange, onRefresh }: {
  data: DashboardStats | null;
  loading: boolean;
  filter: DashboardFilter;
  onFilterChange: (value: DashboardFilter) => void;
  onRefresh: () => void;
}) {
  const hasFilter = filter.mode === "day" ? Boolean(filter.date) : filter.mode === "range" ? Boolean(filter.startDate && filter.endDate) : false;
  const rangeLabel =
    filter.mode === "day" && filter.date
      ? `Single day: ${filter.date}`
      : filter.mode === "range" && filter.startDate && filter.endDate
        ? `Date range: ${filter.startDate} to ${filter.endDate}`
        : "Latest operational snapshot";

  return (
    <SectionShell title="Dashboard" subtitle={rangeLabel} onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      <PeriodFilter
        filter={filter}
        loading={loading}
        onFilterChange={onFilterChange}
        description="Choose a single day or date range to review coupon usage, remaining campaign supply, game activity, and recent store activity."
      />
      {loading || !data ? <LoadingCard /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="New Coupons Created"
              value={String(data.coupons.issued)}
              sub={data.coupons.issuanceLimit
                ? `${data.coupons.issuanceLimit.current}/${data.coupons.issuanceLimit.max} ${data.coupons.issuanceLimit.type} limit (${data.coupons.issuanceLimit.percentUsed}%)`
                : "Actual coupon records"}
              color={undefined}
            />
            <KpiCard
              label="Coupon Upgrades"
              value={String(data.game.couponUpdatesFromGame ?? 0)}
              sub="Existing coupon improved"
              color="green"
            />
            <KpiCard label="Coupons Used" value={String(data.coupons.redeemed)} sub={`Usage rate ${data.coupons.redeemRate}%`} color="green" />
            <KpiCard
              label="Coupons Remaining"
              value={data.coupons.issuanceLimit ? String(Math.max(0, data.coupons.issuanceLimit.max - data.coupons.issuanceLimit.current)) : "-"}
              sub={data.coupons.issuanceLimit ? `${data.coupons.issuanceLimit.type} supply` : "No limit configured"}
              color="orange"
            />
            <KpiCard label={hasFilter ? "Game Plays" : "Game Plays (14 days)"} value={String(data.game.totalSessions)} sub={`${data.game.couponIssuedFromGame} reward wins`} />
          </div>

          <div className="mt-3 grid gap-2 text-xs font-semibold text-[#8f6870] md:grid-cols-2 xl:grid-cols-4">
            <p><span className="font-black text-[#5b343d]">New Coupons Created</span> means coupon records newly added to customer wallets.</p>
            <p><span className="font-black text-[#5b343d]">Coupon Upgrades</span> means an existing active coupon was improved to a higher reward.</p>
            <p><span className="font-black text-[#5b343d]">Reward Won</span> means a game earned a coupon reward, including new coupons and upgrades.</p>
            <p><span className="font-black text-[#5b343d]">Coupons Used</span> means coupons redeemed by staff at the store.</p>
          </div>

          <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Coupon Flow</p>
            <p className="mt-1 text-xs font-semibold text-[#9a6f75]">
              Reward Won is not redemption. It counts game sessions that earned a coupon reward; Coupon Redeemed counts coupons actually used in store.
            </p>
            <div className="mt-5 flex items-end gap-2 overflow-x-auto pb-2">
              {data.funnel.map((step, i) => {
                const max = data.funnel[0]?.value ?? 1;
                const pct = max > 0 ? Math.max(8, Math.round((step.value / max) * 100)) : 8;
                return (
                  <div key={step.label} className="flex min-w-[80px] flex-1 flex-col items-center gap-2">
                    {i > 0 && <p className="text-xs font-black text-[#c4a0ae]">
                      {data.funnel[i - 1]!.value > 0 ? `${Math.round((step.value / data.funnel[i - 1]!.value) * 100)}%` : "-"}
                    </p>}
                    {i === 0 && <p className="text-xs text-transparent">-</p>}
                    <div className="w-full rounded-xl bg-[linear-gradient(135deg,#ff9473,#ff6675)]" style={{ height: `${pct * 1.5}px` }} />
                    <p className="text-center text-xs font-black text-[#5b343d]">{step.label}</p>
                    <p className="text-lg font-black text-[#4f2832]">{step.value.toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">{hasFilter ? "Coupon Issuance" : "Daily Coupon Issuance (14 Days)"}</p>
              <MiniBarChart series={data.charts.issuedByDay} color="bg-[#ff9a76]" />
            </div>
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">{hasFilter ? "Coupon Redemption" : "Daily Coupon Redemption (14 Days)"}</p>
              <MiniBarChart series={data.charts.redeemedByDay} color="bg-[#46b874]" />
            </div>
          </div>

          {/* Recent redeems */}
          {data.recentRedeems.length > 0 && (
            <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Recent Redemption Logs</p>
              <div className="mt-3 space-y-2">
                {data.recentRedeems.map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-2xl bg-[#fff9f4] px-4 py-2.5 text-sm">
                    <span className="font-black text-[#4f2832]">{log.action_type}</span>
                    <span className="text-[#9a6f75]">{log.store_id ?? "-"}</span>
                    <span className="text-xs text-[#c4a0ae]">{formatDateTime(log.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
}

function PeriodFilter({ filter, loading, onFilterChange, description }: {
  filter: DashboardFilter;
  loading: boolean;
  onFilterChange: (value: DashboardFilter) => void;
  description: string;
}) {
  const hasFilter = filter.mode === "day" ? Boolean(filter.date) : filter.mode === "range" ? Boolean(filter.startDate && filter.endDate) : false;
  const setMode = (mode: DashboardFilter["mode"]) => onFilterChange({ ...filter, mode });
  const clearFilter = () => onFilterChange({ mode: "latest", date: "", startDate: "", endDate: "" });

  return (
    <div className="mb-5 rounded-[1.6rem] border border-[#f0ddd8] bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-[#c36b66]">Time Period</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode("day")} className={`rounded-2xl border px-4 py-2.5 text-sm font-black ${filter.mode === "day" ? "border-[#ff8a70] bg-[#fff0e8] text-[#c0502a]" : "border-[#edd9d5] text-[#8a6670]"}`}>Single Day</button>
            <button type="button" onClick={() => setMode("range")} className={`rounded-2xl border px-4 py-2.5 text-sm font-black ${filter.mode === "range" ? "border-[#ff8a70] bg-[#fff0e8] text-[#c0502a]" : "border-[#edd9d5] text-[#8a6670]"}`}>Date Range</button>
          </div>
        </div>
        {filter.mode === "day" ? (
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[#c36b66]">Date</span>
            <input
              type="date"
              value={filter.date}
              onChange={(event) => onFilterChange({ ...filter, date: event.target.value })}
              className="mt-2 rounded-2xl border border-[#edd9d5] px-4 py-2.5 text-sm font-bold text-[#4d2931] outline-none"
            />
          </label>
        ) : null}
        {filter.mode === "range" ? (
          <>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#c36b66]">Start Date</span>
              <input
                type="date"
                value={filter.startDate}
                onChange={(event) => onFilterChange({ ...filter, startDate: event.target.value })}
                className="mt-2 rounded-2xl border border-[#edd9d5] px-4 py-2.5 text-sm font-bold text-[#4d2931] outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#c36b66]">End Date</span>
              <input
                type="date"
                value={filter.endDate}
                onChange={(event) => onFilterChange({ ...filter, endDate: event.target.value })}
                className="mt-2 rounded-2xl border border-[#edd9d5] px-4 py-2.5 text-sm font-bold text-[#4d2931] outline-none"
              />
            </label>
          </>
        ) : null}
        <button
          type="button"
          onClick={clearFilter}
          disabled={!hasFilter || loading}
          className="rounded-2xl border border-[#ecd9d2] px-4 py-2.5 text-sm font-black text-[#764a56] disabled:opacity-50"
        >
          Show Latest
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold text-[#9a6f75]">{description}</p>
    </div>
  );
}

// ??? Section: Game Analytics ??????????????????????????????????????????????????

function CouponSettingsSection({ settings, loading, saving, onChange, onSave, onRefresh }: {
  settings: CouponSettings | null;
  loading: boolean;
  saving: boolean;
  onChange: (settings: CouponSettings) => void;
  onSave: (settings: CouponSettings) => void;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<CouponSettings | null>(null);
  const [qrPreview, setQrPreview] = useState<{ value: string; label: string; dataUrl: string } | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const current = settings ?? {
    issuanceLimit: {
      type: "daily" as const,
      max: 500,
      stopOnReach: true,
      enabled: true,
      campaignStartDate: "",
      campaignStartTime: "",
      campaignEndDate: "",
      campaignEndTime: "",
      soldOutMessage: "아쉽게도 오늘의 쿠폰이 모두 소진되었습니다.",
    },
    rewardTiers: [
      { threshold: 200, discountPercent: 20, active: true },
      { threshold: 150, discountPercent: 15, active: true },
      { threshold: 100, discountPercent: 10, active: true },
      { threshold: 50, discountPercent: 5, active: true },
      { threshold: 30, discountPercent: 3, active: true },
    ],
    issuanceStats: { dailyIssued: 0, campaignIssued: 0, currentIssued: 0, percentUsed: 0 },
  };
  const limit = current.issuanceLimit ?? {
    type: "daily" as const,
    max: 500,
    stopOnReach: true,
    enabled: true,
    campaignStartDate: "",
    campaignStartTime: "",
    campaignEndDate: "",
    campaignEndTime: "",
    soldOutMessage: "아쉽게도 오늘의 쿠폰이 모두 소진되었습니다.",
  };
  const campaignDeadlineMs = limit.type === "campaign" ? getCampaignDeadlineMs(limit.campaignEndDate, limit.campaignEndTime) : null;
  const campaignCountdown = campaignDeadlineMs === null ? null : formatCountdown(campaignDeadlineMs - nowMs);

  useEffect(() => {
    if (campaignDeadlineMs === null) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaignDeadlineMs]);

  const updateLimit = (patch: Partial<NonNullable<CouponSettings["issuanceLimit"]>>) => {
    onChange({ ...current, issuanceLimit: { ...limit, ...patch } });
  };
  const toggleTierActive = (index: number) => {
    const next = { ...current, rewardTiers: current.rewardTiers.map((tier, i) => i === index ? { ...tier, active: tier.active === false } : tier) };
    onChange(next);
  };

  const enterEdit = () => {
    setEditSnapshot(current);
    setIsEditing(true);
  };
  const cancelEdit = () => {
    if (editSnapshot) onChange(editSnapshot);
    setIsEditing(false);
    setEditSnapshot(null);
  };
  const saveEdit = () => {
    const activeTiers = current.rewardTiers
      .filter((tier) => tier.active !== false)
      .map((tier) => `${tier.threshold}+ pts: ${tier.discountPercent}%`)
      .join(", ");
    const policyWindow = limit.type === "daily"
      ? `Daily window: ${limit.dailyStartTime || "00:00"} ~ ${limit.dailyEndTime || "24:00"} Dallas time`
      : `Campaign: ${formatCampaignPeriod(limit.campaignStartDate, limit.campaignStartTime)} ~ ${formatCampaignPeriod(limit.campaignEndDate, limit.campaignEndTime)} Dallas time`;
    const confirmed = window.confirm([
      "Save these coupon settings?",
      `Type: ${limit.type}`,
      `Maximum coupons: ${limit.max.toLocaleString()}`,
      policyWindow,
      `Active tiers: ${activeTiers || "none"}`,
    ].join("\n"));
    if (!confirmed) return;
    onSave(current);
    setIsEditing(false);
    setEditSnapshot(null);
  };

  const togglePause = () => {
    const next = { ...current, issuanceLimit: { ...limit, enabled: limit.enabled === false } };
    onChange(next);
    onSave(next);
  };

  const showQrPreview = async (tier: CouponRewardTier) => {
    const value = tier.fixedQrValue?.trim() || `YL${tier.discountPercent}`;
    try {
      const dataUrl = await QRCode.toDataURL(value, { width: 200, margin: 2, color: { dark: "#4d2931", light: "#ffffff" } });
      setQrPreview({ value, label: `${tier.discountPercent}% OFF · min ${tier.threshold} pts`, dataUrl });
    } catch { /* ignore */ }
  };

  return (
    <SectionShell title="Coupon Settings" subtitle="Issuance limits and score-based reward tiers" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {qrPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setQrPreview(null)}>
          <div className="mx-4 w-full max-w-xs rounded-[2rem] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">QR Preview</p>
            <div className="mt-4 flex justify-center">
              <img src={qrPreview.dataUrl} alt="QR Code" className="h-48 w-48 rounded-xl" />
            </div>
            <p className="mt-3 text-center text-sm font-black text-[#4f2832]">{qrPreview.label}</p>
            <p className="mt-1 break-all text-center font-mono text-xs text-[#9a6f75]">{qrPreview.value}</p>
            <button type="button" onClick={() => setQrPreview(null)} className="mt-5 w-full rounded-2xl bg-[#fff0e8] py-3 text-sm font-black text-[#c0502a]">Close</button>
          </div>
        </div>
      )}
      {loading || !settings ? <LoadingCard /> : (
        <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Coupon Policy</p>
              <p className="mt-1 text-xs font-semibold text-[#9a6f75]">
                {isEditing
                  ? <span className="font-black text-[#e08a50]">Editing — unsaved changes</span>
                  : <>{limit.enabled !== false ? "Issuing coupons" : "Paused — no new coupons being issued"}{" · "}{limit.type === "daily" ? "Daily" : "Campaign"} limit: {limit.max.toLocaleString()}</>
                }
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={togglePause}
                disabled={saving}
                className={`rounded-2xl border px-4 py-2 text-sm font-black disabled:opacity-60 ${limit.enabled !== false ? "border-[#f0ccc5] bg-white text-[#c0502a]" : "border-[#75c28b] bg-[#e8f8ee] text-[#2a8a50]"}`}
              >
                {limit.enabled !== false ? "Pause" : "Resume"}
              </button>
              {!isEditing ? (
                <button type="button" onClick={enterEdit} className="rounded-2xl border border-[#edd9d5] px-4 py-2 text-sm font-black text-[#764a56]">Edit</button>
              ) : (
                <>
                  <button type="button" onClick={cancelEdit} className="rounded-2xl border border-[#edd9d5] px-4 py-2 text-sm font-black text-[#764a56]">Cancel</button>
                  <button type="button" onClick={saveEdit} disabled={saving} className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-5 py-2 text-sm font-black text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-[#f5e4de] pt-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Issuance Limit</p>
            {isEditing ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Limit Type</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["daily", "campaign"] as const).map((type) => (
                      <button key={type} type="button" onClick={() => updateLimit({ type })} className={`rounded-2xl border px-3 py-2 text-sm font-black ${limit.type === type ? "border-[#ff8a70] bg-[#fff0e8] text-[#c0502a]" : "border-[#edd9d5] text-[#8a6670]"}`}>
                        {type === "daily" ? "Daily" : "Campaign"}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Maximum Coupons</span>
                  <input value={String(limit.max)} onChange={(e) => updateLimit({ max: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                </label>
                {limit.type === "daily" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Daily Start Time</span>
                      <input type="time" value={limit.dailyStartTime ?? ""} onChange={(e) => updateLimit({ dailyStartTime: e.target.value || null })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Daily End Time</span>
                      <input type="time" value={limit.dailyEndTime ?? ""} onChange={(e) => updateLimit({ dailyEndTime: e.target.value || null })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                  </div>
                ) : null}
                {limit.type === "campaign" ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Start Date</span>
                      <input type="date" value={limit.campaignStartDate ?? ""} onChange={(e) => updateLimit({ campaignStartDate: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Start Time</span>
                      <input type="time" value={limit.campaignStartTime ?? ""} onChange={(e) => updateLimit({ campaignStartTime: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">End Date</span>
                      <input type="date" value={limit.campaignEndDate ?? ""} onChange={(e) => updateLimit({ campaignEndDate: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">End Time</span>
                      <input type="time" value={limit.campaignEndTime ?? ""} onChange={(e) => updateLimit({ campaignEndTime: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Sold-Out Message</span>
                  <input value={limit.soldOutMessage ?? ""} onChange={(e) => updateLimit({ soldOutMessage: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                </label>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                  <p className="text-xs font-semibold text-[#9a6f75]">Type</p>
                  <p className="mt-1 text-sm font-black text-[#4f2832]">{limit.type === "daily" ? "Daily" : "Campaign"}</p>
                </div>
                <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                  <p className="text-xs font-semibold text-[#9a6f75]">Max</p>
                  <p className="mt-1 text-sm font-black text-[#4f2832]">{limit.max.toLocaleString()}</p>
                </div>
                {limit.type === "daily" && (limit.dailyStartTime || limit.dailyEndTime) && (
                  <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                    <p className="text-xs font-semibold text-[#9a6f75]">Daily Window</p>
                    <p className="mt-1 text-sm font-black text-[#4f2832]">
                      {limit.dailyStartTime ?? "—"} ~ {limit.dailyEndTime ?? "—"}
                    </p>
                  </div>
                )}
                {limit.type === "campaign" && (limit.campaignStartDate || limit.campaignEndDate) && (
                  <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                    <p className="text-xs font-semibold text-[#9a6f75]">Period</p>
                    <p className="mt-1 text-sm font-black text-[#4f2832]">
                      {formatCampaignPeriod(limit.campaignStartDate, limit.campaignStartTime)} ~ {formatCampaignPeriod(limit.campaignEndDate, limit.campaignEndTime)}
                    </p>
                  </div>
                )}
                {campaignCountdown && (
                  <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                    <p className="text-xs font-semibold text-[#9a6f75]">Countdown</p>
                    <p className="mt-1 font-mono text-sm font-black tabular-nums text-[#c0502a]">{campaignCountdown}</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 rounded-2xl bg-[#fff9f4] p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-black text-[#4f2832]">Current Issued</span>
                <span className="font-black text-[#c0502a]">{current.issuanceStats.currentIssued} / {limit.max}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f4ded8]">
                <div className="h-full rounded-full bg-[#ff8a70]" style={{ width: `${Math.min(100, current.issuanceStats.percentUsed)}%` }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-[#9a6f75]">{current.issuanceStats.percentUsed}% used</p>
              {current.issuanceStats.completedAt && (
                <p className="mt-1.5 text-xs font-black text-[#2a8a50]">Limit reached · {formatDateTime(current.issuanceStats.completedAt)}</p>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-[#f5e4de] pt-5">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Reward Tiers</p>
            <p className="mt-1 text-xs font-semibold text-[#9a6f75]">Inactive tiers are saved but ignored for new coupon issuance.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {current.rewardTiers.map((tier, index) => (
                <div key={`${tier.threshold}-${index}`} className={`rounded-2xl border p-3 transition-opacity ${tier.active === false ? "border-[#f0ddd8] bg-[#fdf5f3] opacity-60" : "border-[#edd9d5] bg-[#fff9f4]"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-lg font-black text-[#4d2931]">{tier.discountPercent}%</p>
                    <button type="button" onClick={() => void showQrPreview(tier)} className="rounded-xl border border-[#edd9d5] px-1.5 py-0.5 text-[10px] font-black text-[#9a6f75] hover:border-[#cd6d66] hover:text-[#cd6d66]" title="Preview QR Code">QR</button>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-[#9a6f75]">min {tier.threshold} pts</p>
                  {isEditing && (
                    <button type="button" onClick={() => toggleTierActive(index)} disabled={saving} className={`mt-3 w-full rounded-xl border py-1.5 text-xs font-black disabled:opacity-50 ${tier.active === false ? "border-[#75c28b] text-[#2a8a50]" : "border-[#f0ccc5] text-[#c0502a]"}`}>
                      {tier.active === false ? "Activate" : "Deactivate"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[#f0ddd8] bg-[#fffdf8] p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#cd6d66]">Recent Setting Changes</p>
            {(current.history ?? []).length === 0 ? (
              <p className="mt-2 text-xs font-semibold text-[#9a6f75]">No setting changes recorded yet.</p>
            ) : (
              <>
                <div className="mt-3 space-y-2">
                  {(showAllHistory ? current.history ?? [] : (current.history ?? []).slice(0, 3)).map((row) => {
                    const diffs = summarizeConfigChanges(row.changes);
                    return (
                      <div key={row.id} className="rounded-xl bg-white px-3 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-black text-[#4f2832]">{row.changed_by || "admin"}</span>
                          <span className="font-semibold text-[#9a6f75]">{formatDateTime(row.created_at)}</span>
                        </div>
                        {diffs.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {diffs.map((d, i) => (
                              <li key={i} className="text-[#7a5560]">{d}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(current.history ?? []).length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((v) => !v)}
                    className="mt-2 text-xs font-black text-[#cd6d66] hover:underline"
                  >
                    {showAllHistory ? "Show less" : `Show all ${(current.history ?? []).length} changes`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function GameSettingsSection({ config, state, loading, saving, onChange, onSave, onRefresh }: {
  config: GameAccessConfig | null;
  state: GameAccessState | null;
  loading: boolean;
  saving: boolean;
  onChange: (value: GameAccessConfig) => void;
  onSave: (value: GameAccessConfig) => void;
  onRefresh: () => void;
}) {
  const fallback = resolveGameAccessState(null).config;
  const current = config ?? fallback;
  const effectiveState = state ?? resolveGameAccessState(current);
  const update = (patch: Partial<GameAccessConfig>) => onChange({ ...current, ...patch });
  const statusLabel = effectiveState.isOpen
    ? "Open now"
    : effectiveState.reason === "not_started"
      ? "Scheduled, not started"
      : effectiveState.reason === "ended"
        ? "Ended"
        : "Closed";
  const statusSub = current.mode === "scheduled"
    ? `${formatCampaignPeriod(current.startDate, current.startTime)} ~ ${formatCampaignPeriod(current.endDate, current.endTime)} Dallas time`
    : current.mode === "closed"
      ? "Players can still open wallet and redeem active coupons."
      : "Players can start the game normally.";
  const save = () => {
    const confirmed = window.confirm([
      "Save these game access settings?",
      `Mode: ${current.mode}`,
      `Status after save: ${resolveGameAccessState(current).isOpen ? "Open" : "Closed"}`,
      current.mode === "scheduled"
        ? `Schedule: ${formatCampaignPeriod(current.startDate, current.startTime)} ~ ${formatCampaignPeriod(current.endDate, current.endTime)} Dallas time`
        : null,
    ].filter(Boolean).join("\n"));
    if (confirmed) onSave(current);
  };

  return (
    <SectionShell title="Game Settings" subtitle="Control when players can start the game" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading || !config ? <LoadingCard /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Access Mode</p>
                <p className="mt-1 text-xs font-semibold text-[#9a6f75]">{statusSub}</p>
              </div>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {(["open", "closed", "scheduled"] as const).map((mode) => {
                const desc =
                  mode === "open"
                    ? "Game is live. Players can play anytime."
                    : mode === "closed"
                      ? "Game is blocked. Players see the closed message."
                      : "Game opens automatically within the set date & time range.";
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update({ mode, enabled: mode !== "closed" })}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      current.mode === mode
                        ? "border-[#ff8a70] bg-[#fff0e8]"
                        : "border-[#edd9d5]"
                    }`}
                  >
                    <p className={`text-sm font-black capitalize ${current.mode === mode ? "text-[#c0502a]" : "text-[#8a6670]"}`}>{mode}</p>
                    <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#9a6f75]">{desc}</p>
                  </button>
                );
              })}
            </div>

            {current.mode === "scheduled" ? (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Game Opens</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#9a6f75]">Date</span>
                      <input type="date" value={current.startDate ?? ""} onChange={(e) => update({ startDate: e.target.value || null })} className="mt-1.5 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#9a6f75]">Time</span>
                      <input type="time" value={current.startTime ?? ""} onChange={(e) => update({ startTime: e.target.value || null })} className="mt-1.5 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Game Closes <span className="normal-case font-semibold text-[#9a6f75]">(play stops, wallet still open)</span></p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#9a6f75]">Date</span>
                      <input type="date" value={current.endDate ?? ""} onChange={(e) => update({ endDate: e.target.value || null })} className="mt-1.5 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#9a6f75]">Time</span>
                      <input type="time" value={current.endTime ?? ""} onChange={(e) => update({ endTime: e.target.value || null })} className="mt-1.5 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="text-[11px] font-semibold text-[#9a6f75]">Message</span>
                    <textarea
                      value={current.closedMessage ?? ""}
                      onChange={(e) => update({ closedMessage: e.target.value })}
                      maxLength={220}
                      rows={2}
                      placeholder="The game is currently closed. You can still access your wallet and redeem available coupons."
                      className="mt-1.5 w-full resize-none rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none placeholder:font-normal placeholder:text-[#c4a8a8]"
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Complete Block <span className="normal-case font-semibold text-[#9a6f75]">(entire page blocked)</span></p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#9a6f75]">Date</span>
                      <input type="date" value={current.blockDate ?? ""} onChange={(e) => update({ blockDate: e.target.value || null })} className="mt-1.5 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#9a6f75]">Time</span>
                      <input type="time" value={current.blockTime ?? ""} onChange={(e) => update({ blockTime: e.target.value || null })} className="mt-1.5 w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="text-[11px] font-semibold text-[#9a6f75]">Message</span>
                    <textarea
                      value={current.blockMessage ?? ""}
                      onChange={(e) => update({ blockMessage: e.target.value })}
                      maxLength={220}
                      rows={2}
                      placeholder="This campaign has ended. This page is no longer available."
                      className="mt-1.5 w-full resize-none rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none placeholder:font-normal placeholder:text-[#c4a8a8]"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {current.mode !== "scheduled" && (
              <label className="mt-5 block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">Closed Message</span>
                <textarea
                  value={current.closedMessage ?? ""}
                  onChange={(e) => update({ closedMessage: e.target.value })}
                  maxLength={220}
                  rows={3}
                  placeholder="The game is currently closed. You can still access your wallet and redeem available coupons."
                  className="mt-2 w-full resize-none rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none placeholder:font-normal placeholder:text-[#c4a8a8]"
                />
              </label>
            )}

          </div>

          <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Current Status</p>
            <div className={`mt-4 rounded-2xl px-4 py-4 ${effectiveState.isOpen ? "bg-[#e8f8ee]" : "bg-[#fff0e8]"}`}>
              <p className={`text-2xl font-black ${effectiveState.isOpen ? "text-[#2a8a50]" : "text-[#c0502a]"}`}>{statusLabel}</p>
              <p className="mt-2 text-sm font-bold text-[#4f2832]">{effectiveState.message || "Players can start the game."}</p>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                <p className="text-xs font-semibold text-[#9a6f75]">Game Opens</p>
                <p className="mt-1 text-sm font-black text-[#4f2832]">{current.startDate ? formatCampaignPeriod(current.startDate, current.startTime) : "—"}</p>
              </div>
              <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                <p className="text-xs font-semibold text-[#9a6f75]">Game Closes</p>
                <p className="mt-1 text-sm font-black text-[#4f2832]">{current.endDate ? formatCampaignPeriod(current.endDate, current.endTime) : "—"}</p>
              </div>
              <div className="rounded-2xl bg-[#fff9f4] px-4 py-3">
                <p className="text-xs font-semibold text-[#9a6f75]">Complete Block</p>
                <p className="mt-1 text-sm font-black text-[#4f2832]">{current.blockDate ? formatCampaignPeriod(current.blockDate, current.blockTime) : "—"}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function GameSection({ data, loading, filter, onFilterChange, onRefresh }: {
  data: GameAnalytics | null;
  loading: boolean;
  filter: DashboardFilter;
  onFilterChange: (value: DashboardFilter) => void;
  onRefresh: () => void;
}) {
  const hasFilter = filter.mode === "day" ? Boolean(filter.date) : filter.mode === "range" ? Boolean(filter.startDate && filter.endDate) : false;
  const subtitle =
    filter.mode === "day" && filter.date
      ? `Game metrics for ${filter.date}`
      : filter.mode === "range" && filter.startDate && filter.endDate
        ? `Game metrics from ${filter.startDate} to ${filter.endDate}`
        : "Session-based gameplay metrics";

  return (
    <SectionShell title="Games" subtitle={subtitle} onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      <PeriodFilter
        filter={filter}
        loading={loading}
        onFilterChange={onFilterChange}
        description="Choose a single day or date range to filter game sessions, scores, coupon conversion, and recent plays."
      />
      {loading || !data ? <LoadingCard /> : data.totalSessions === 0 ? (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-10 text-center">
          <p className="text-4xl">Game</p>
          <p className="mt-3 font-black text-[#4f2832]">No game session data yet</p>
          <p className="mt-1 text-sm text-[#9a6f75]">Data will be collected automatically once the game is played.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Sessions" value={String(data.totalSessions)} sub={hasFilter ? "Selected period" : "Cumulative"} />
            <KpiCard label="Average Score" value={String(data.avgScore)} sub="pts" color="orange" />
            <KpiCard label="Average Play Time" value={data.avgPlayTimeSec != null ? `${data.avgPlayTimeSec}s` : "-"} sub="" />
            <KpiCard label="Coupon Conversion Rate" value={`${data.couponIssuedRate}%`} sub={`${data.couponIssuedCount} issued`} color="green" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Sessions by day */}
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">{hasFilter ? "Daily Sessions" : "Daily Sessions (14 Days)"}</p>
              <MiniBarChart series={data.sessionsByDay} color="bg-[#a78bfa]" />
            </div>

            {/* Score distribution */}
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Score Distribution</p>
              {data.scoreDistribution.length === 0 ? (
                <p className="mt-4 text-sm text-[#9a6f75]">No data</p>
              ) : (
                <div className="mt-4">
                  {(() => {
                    const maxCount = Math.max(...data.scoreDistribution.map((b) => b.count), 1);
                    return data.scoreDistribution.map((bucket) => (
                      <div key={bucket.range} className="mb-2 grid grid-cols-[64px_1fr_36px] items-center gap-2">
                        <span className="text-xs font-black text-[#8a6670]">{bucket.range}</span>
                        <div className="h-4 rounded-full bg-[#f5ede9]">
                          <div className="h-4 rounded-full bg-[#ff9a76]" style={{ width: `${Math.max(6, (bucket.count / maxCount) * 100)}%` }} />
                        </div>
                        <span className="text-right text-xs font-black text-[#5b343d]">{bucket.count}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Recent sessions */}
          <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Recent Sessions</p>
            <div className="mt-3 space-y-2">
              {data.recentSessions.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#fff9f4] px-4 py-2.5 text-sm">
                  <span className="font-black text-[#4f2832]">{s.score}pts</span>
                  <span className="text-xs text-[#9a6f75]">{s.nickname_key ?? "Anonymous"}</span>
                  <span className="text-xs text-[#9a6f75]">{s.mode}</span>
                  {s.coupon_issued && <span className="rounded-full bg-[#e6f9ee] px-2 py-0.5 text-[10px] font-black text-[#2a8a50]">Reward Won</span>}
                  <span className="text-xs text-[#c4a0ae]">{formatDateTime(s.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionShell>
  );
}

// ??? Section: Store Analytics ?????????????????????????????????????????????????

function StoreSection({ data, loading, onRefresh }: { data: StoreStats | null; loading: boolean; onRefresh: () => void }) {
  return (
    <SectionShell title="Store Analytics" subtitle="Coupon redemption activity by offline store" onRefresh={onRefresh} loading={loading} csvHref="/api/admin/redeem-logs?format=csv">
      {loading || !data ? <LoadingCard /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Total Issued" value={String(data.totals.issued)} sub="Cumulative" />
            <KpiCard label="Redeemed" value={String(data.totals.redeemed)} sub={`Redemption rate ${data.totals.usageRate}%`} color="green" />
            <KpiCard label="Expired" value={String(data.statusCounts.expired)} sub="" />
          </div>

          <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Redemptions by Store</p>
            {data.storeUsage.length === 0 ? (
              <p className="mt-3 text-sm text-[#9a6f75]">No store redemption records yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {(() => {
                  const max = Math.max(...data.storeUsage.map((s) => s.count), 1);
                  return data.storeUsage.map((item) => (
                    <div key={item.storeId} className="grid grid-cols-[1fr_80px_48px] items-center gap-3">
                      <span className="truncate text-sm font-black text-[#5b343d]">{item.storeId}</span>
                      <div className="h-4 rounded-full bg-[#f5ede9]">
                        <div className="h-4 rounded-full bg-[#ff9a76]" style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} />
                      </div>
                      <span className="text-right text-sm font-black text-[#5b343d]">{item.count} times</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Daily Issuance</p>
              <MiniBarChart series={data.charts.issuedByDay} color="bg-[#ff9a76]" />
            </div>
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Daily Redemption</p>
              <MiniBarChart series={data.charts.redeemedByDay} color="bg-[#46b874]" />
            </div>
          </div>
        </>
      )}
    </SectionShell>
  );
}

// ??? Section: User Search ?????????????????????????????????????????????????????

function UserSection({ query, results, loading, expiringId, onQueryChange, onSearch, onExpire }: {
  query: string; results: UserEntry[]; loading: boolean; expiringId: number | null;
  onQueryChange: (v: string) => void; onSearch: () => void;
  onExpire: (couponId: number, entryId: number) => void;
}) {
  return (
    <SectionShell title="Players" subtitle="Look up players and wallet coupons by nickname" onRefresh={onSearch} loading={loading} csvHref={undefined}>
      <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
        <div className="flex gap-3">
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder="Nickname (2+ characters)" className="flex-1 rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
          <button type="button" onClick={onSearch} disabled={loading} className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-6 text-sm font-black text-white disabled:opacity-60">
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {results.map((user) => (
        <div key={user.id} className="mt-4 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black text-[#4f2832]">{user.nickname_display || user.nickname_key}</p>
              <p className="mt-0.5 text-xs text-[#9a6f75]">
                Joined {formatDateTime(user.created_at)}
              </p>
            </div>
            <span className="rounded-full bg-[#fff0f0] px-3 py-1 text-xs font-black text-[#cd6d66]">{user.walletCoupons.length} coupons</span>
          </div>

          {user.walletCoupons.length === 0 ? (
            <p className="mt-3 text-sm text-[#b89aa5]">No issued coupons</p>
          ) : (
            <div className="mt-3 space-y-2">
              {user.walletCoupons.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f5e4de] bg-[#fff9f4] px-4 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-[#4f2832]">{c.title}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-[#b89aa5]">Issued {formatDateTime(c.created_at)} - Expires {formatDateTime(c.expires_at)}</p>
                  </div>
                  {c.status === "active" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Expire this coupon now?")) onExpire(c.id, user.id);
                      }}
                      disabled={expiringId === c.id}
                      className="rounded-xl border border-[#f0ccc5] bg-white px-3 py-1.5 text-xs font-black text-[#c0502a] disabled:opacity-50">
                      {expiringId === c.id ? "Processing..." : "Expire Manually"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </SectionShell>
  );
}

// ??? Section: Feedback ????????????????????????????????????????????????????????

function FeedbackSection({ rows, loading, onRefresh }: { rows: FeedbackRow[]; loading: boolean; onRefresh: () => void }) {
  return (
    <SectionShell title="Feedback" subtitle="List of user feedback" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#f5ede9]" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-8 text-center text-sm text-[#b89aa5]">No feedback available.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-[#f0ddd8] bg-white p-4">
              <p className="font-semibold text-[#4f2832]">{row.message}</p>
              <p className="mt-1.5 text-xs text-[#9a6f75]">
                {row.nickname ? `@${row.nickname}` : "Anonymous"}{row.store ? ` - ${row.store}` : ""}{row.source ? ` - ${row.source}` : ""}
                <span className="ml-2 text-[#c4a0ae]">{formatDateTime(row.created_at)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ??? Section: Logs ????????????????????????????????????????????????????????????

function LogsSection({ data, loading, filter, onFilterChange, onRefresh }: {
  data: StoreStats | null;
  loading: boolean;
  filter: DashboardFilter;
  onFilterChange: (value: DashboardFilter) => void;
  onRefresh: () => void;
}) {
  const [actionFilter, setActionFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const subtitle =
    filter.mode === "day" && filter.date
      ? `Coupon redemption logs for ${filter.date}`
      : filter.mode === "range" && filter.startDate && filter.endDate
        ? `Coupon redemption logs from ${filter.startDate} to ${filter.endDate}`
        : "Coupon redemption processing logs";
  const actionOptions = Array.from(new Set((data?.recentLogs ?? []).map((log) => log.action_type))).filter(Boolean);
  const filteredLogs = (data?.recentLogs ?? []).filter((log) => {
    const normalizedSearch = logSearch.trim().toLowerCase();
    const matchesAction = actionFilter === "all" || log.action_type === actionFilter;
    const matchesSearch = !normalizedSearch
      || log.code.toLowerCase().includes(normalizedSearch)
      || (log.store_id ?? "").toLowerCase().includes(normalizedSearch)
      || (log.staff_id ?? "").toLowerCase().includes(normalizedSearch)
      || (log.reason ?? "").toLowerCase().includes(normalizedSearch);
    return matchesAction && matchesSearch;
  });

  return (
    <SectionShell title="Coupon Logs" subtitle={subtitle} onRefresh={onRefresh} loading={loading} csvHref={buildPeriodCsvHref("/api/admin/redeem-logs", filter)}>
      <PeriodFilter
        filter={filter}
        loading={loading}
        onFilterChange={onFilterChange}
        description="Choose a single day or date range to filter coupon totals, redemption charts, store usage, and processing logs."
      />
      {loading || !data ? <LoadingCard /> : (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Processing Logs</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="Search code, store, staff"
                className="rounded-2xl border border-[#edd9d5] px-4 py-2.5 text-sm font-bold text-[#4d2931] outline-none"
              />
              <select
                value={actionFilter}
                onChange={(event) => setActionFilter(event.target.value)}
                className="rounded-2xl border border-[#edd9d5] bg-white px-4 py-2.5 text-sm font-bold text-[#4d2931] outline-none"
              >
                <option value="all">All Actions</option>
                {actionOptions.map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
          </div>
          {data.recentLogs.length === 0 ? (
            <p className="text-sm text-[#9a6f75]">No logs available.</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-[#9a6f75]">No logs match the current filters.</p>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div key={log.id} className="rounded-2xl bg-[#fff9f4] p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black text-[#4f2832]">{log.code}</span>
                    <span className="rounded-full bg-[#fff0e8] px-2 py-0.5 text-xs font-black text-[#c0602a]">{log.action_type}</span>
                  </div>
                  {log.reason && <p className="mt-1 text-[#6b5058]">{log.reason}</p>}
                  <p className="mt-1 text-xs text-[#9a6f75]">
                    {log.store_id ?? "-"} / {log.staff_id ?? "-"} - {formatDateTime(log.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

// ??? Shared UI Components ?????????????????????????????????????????????????????

function SectionShell({ title, subtitle, onRefresh, loading, csvHref, children }: {
  title: string; subtitle: string; onRefresh: () => void; loading: boolean;
  csvHref: string | undefined; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#4f2832]">{title}</h2>
          <p className="text-sm font-semibold text-[#9a6f75]">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {csvHref && (
            <a href={csvHref} className="rounded-2xl border border-[#ecd9d2] px-4 py-2.5 text-sm font-black text-[#764a56]">Download CSV</a>
          )}
          <button type="button" onClick={onRefresh} disabled={loading}
            className="rounded-2xl border border-[#ecd9d2] px-4 py-2.5 text-sm font-black text-[#764a56] disabled:opacity-50">
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: "green" | "orange" }) {
  const valueColor = color === "green" ? "text-[#2a8a50]" : color === "orange" ? "text-[#c0602a]" : "text-[#4f2832]";
  return (
    <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c36b66]">{label}</p>
      <p className={`mt-2 text-3xl font-black ${valueColor}`}>{value}</p>
      {sub && <p className="mt-1 text-xs font-semibold text-[#9a6f75]">{sub}</p>}
    </div>
  );
}

function summarizeConfigChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [];
  const c = changes as { before?: { issuanceLimit?: Record<string, unknown> | null; rewardTiers?: Array<Record<string, unknown>> | null } | null; after?: { issuanceLimit?: Record<string, unknown> | null; rewardTiers?: Array<Record<string, unknown>> | null } };
  const before = c.before;
  const after = c.after;
  if (!after) return [];

  const diffs: string[] = [];
  const bl = before?.issuanceLimit;
  const al = after.issuanceLimit;

  if (al) {
    if (bl?.type !== al.type) diffs.push(`Type: ${bl?.type ?? "—"} → ${al.type}`);
    if (bl?.max !== al.max) diffs.push(`Max: ${bl?.max ?? "—"} → ${al.max}`);
    if (bl?.enabled !== al.enabled) diffs.push(al.enabled === false ? "Paused issuance" : "Resumed issuance");
    if (
      bl?.campaignStartDate !== al.campaignStartDate ||
      bl?.campaignStartTime !== al.campaignStartTime ||
      bl?.campaignEndDate !== al.campaignEndDate ||
      bl?.campaignEndTime !== al.campaignEndTime
    ) {
      const prev = bl?.campaignStartDate
        ? `${formatCampaignPeriod(String(bl.campaignStartDate), typeof bl.campaignStartTime === "string" ? bl.campaignStartTime : null)} ~ ${formatCampaignPeriod(typeof bl.campaignEndDate === "string" ? bl.campaignEndDate : null, typeof bl.campaignEndTime === "string" ? bl.campaignEndTime : null)}`
        : "—";
      const next = al.campaignStartDate
        ? `${formatCampaignPeriod(String(al.campaignStartDate), typeof al.campaignStartTime === "string" ? al.campaignStartTime : null)} ~ ${formatCampaignPeriod(typeof al.campaignEndDate === "string" ? al.campaignEndDate : null, typeof al.campaignEndTime === "string" ? al.campaignEndTime : null)}`
        : "—";
      if (prev !== next) diffs.push(`Period: ${prev} → ${next}`);
    }
  }

  const bt = before?.rewardTiers ?? [];
  const at2 = after.rewardTiers ?? [];
  for (const afterTier of at2) {
    const beforeTier = (bt as Array<Record<string, unknown>>).find((t) => t.threshold === afterTier.threshold);
    if (beforeTier && beforeTier.active !== afterTier.active) {
      diffs.push(afterTier.active === false ? `${afterTier.discountPercent}% tier deactivated` : `${afterTier.discountPercent}% tier activated`);
    }
  }

  return diffs;
}

function formatCouponValue(amount: number, rewardType?: string) {
  if (rewardType === "manual_discount") {
    return `${amount}%`;
  }
  return formatCurrency(amount);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-[#e6f9ee] text-[#2a8a50]",
    used: "bg-[#eef0f5] text-[#6b7280]",
    expired: "bg-[#fff0e8] text-[#c0602a]",
  };
  const labels: Record<string, string> = { active: "Active", used: "Used", expired: "Expired" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${map[status] ?? "bg-[#f5ede9] text-[#9a6f75]"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-10 text-center text-sm font-bold text-[#9a6f75]">
      Loading...
    </div>
  );
}

function MiniBarChart({ series, color }: { series: Array<{ date: string; count: number }>; color: string }) {
  const max = Math.max(...series.map((s) => s.count), 1);
  return (
    <div className="mt-4 flex h-36 items-end gap-1.5">
      {series.map((item) => (
        <div key={item.date} className="flex flex-1 flex-col items-center justify-end gap-1">
          <div className={`w-full rounded-t-lg ${color}`} style={{ height: `${Math.max(4, (item.count / max) * 100)}%` }} />
          <span className="text-[9px] font-black text-[#8a6870]">{item.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}


