"use client";

import { useEffect, useRef, useState } from "react";

import { formatCurrency, formatDateTime } from "../lib/couponMvp";

// ─── Types ───────────────────────────────────────────────────────────────────

type DashboardStats = {
  coupons: {
    issued: number;
    redeemed: number;
    expired: number;
    active: number;
    redeemRate: number;
    issuanceLimit?: { type: "daily" | "campaign"; max: number; current: number; percentUsed: number; warning: boolean; stopOnReach: boolean } | null;
  };
  game: { totalSessions: number; completedSessions: number; completionRate: number; couponIssuedFromGame: number; gameToConversionRate: number };
  funnel: Array<{ label: string; value: number }>;
  charts: { issuedByDay: Array<{ date: string; count: number }>; redeemedByDay: Array<{ date: string; count: number }> };
  recentRedeems: Array<{ id: number; action_type: string; store_id: string | null; created_at: string }>;
};

type GameAnalytics = {
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

type CouponListRow = {
  id: number;
  code: string;
  couponName: string;
  rewardType: string;
  discountAmount: number;
  status: string;
  expiresAt: string;
  userId: string | null;
};

type StoreStats = {
  totals: { issued: number; redeemed: number; usageRate: number };
  statusCounts: { unused: number; used: number; expired: number };
  storeUsage: Array<{ storeId: string; count: number }>;
  recentLogs: Array<{ id: number; code: string; action_type: string; reason: string; store_id: string | null; staff_id: string | null; created_at: string }>;
  charts: { issuedByDay: Array<{ date: string; count: number }>; redeemedByDay: Array<{ date: string; count: number }> };
};

type WalletCoupon = { id: number; title: string; reward_type: string; status: string; expires_at: string; created_at: string; redeemed_at: string | null };
type UserEntry = { id: number; nickname_display: string; nickname_key: string; contact_type: string | null; contact_value: string | null; created_at: string; walletCoupons: WalletCoupon[] };
type FeedbackRow = { id: number; message: string; nickname: string | null; store: string | null; source: string | null; created_at: string };

type CouponRewardTier = { threshold: number; discountPercent: number; fixedQrValue?: string | null };
type CouponSettings = {
  issuanceLimit: { type: "daily" | "campaign"; max: number; stopOnReach: boolean } | null;
  rewardTiers: CouponRewardTier[];
  issuanceStats: { dailyIssued: number; campaignIssued: number; currentIssued: number; percentUsed: number };
};

type NavItem = "dashboard" | "coupon" | "couponSettings" | "game" | "users" | "feedback" | "logs";

const DEFAULT_MANUAL_DISCOUNT_PERCENT = 3;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboardClient() {
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Dashboard
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Game analytics
  const [gameData, setGameData] = useState<GameAnalytics | null>(null);
  const [gameLoading, setGameLoading] = useState(false);

  // Coupon management
  const [coupons, setCoupons] = useState<CouponListRow[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState("");
  const [discountPercent, setDiscountPercent] = useState(String(DEFAULT_MANUAL_DISCOUNT_PERCENT));

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

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadDashboard = async () => {
    setDashLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard-stats", { cache: "no-store" });
      setDashStats((await res.json()) as DashboardStats);
      loadedRef.current.dashboard = true;
    } finally { setDashLoading(false); }
  };

  const loadGame = async () => {
    setGameLoading(true);
    try {
      const res = await fetch("/api/admin/game-analytics", { cache: "no-store" });
      setGameData((await res.json()) as GameAnalytics);
      loadedRef.current.game = true;
    } finally { setGameLoading(false); }
  };

  const loadCoupons = async () => {
    setCouponLoading(true);
    try {
      const res = await fetch("/api/admin/coupons?limit=30", { cache: "no-store" });
      const json = (await res.json()) as { rows?: CouponListRow[] };
      setCoupons(json.rows ?? []);
      loadedRef.current.coupon = true;
    } finally { setCouponLoading(false); }
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
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      setStoreStats((await res.json()) as StoreStats);
      loadedRef.current.logs = true;
    } finally { setStoreLoading(false); }
  };

  const loadFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/admin/feedback-view", { cache: "no-store" });
      const json = (await res.json()) as { rows?: FeedbackRow[] };
      setFeedbackRows(json.rows ?? []);
      setFeedbackLoaded(true);
      loadedRef.current.feedback = true;
    } finally { setFeedbackLoading(false); }
  };

  const createCoupon = async () => {
    const parsedPercent = Number(discountPercent);
    if (!Number.isFinite(parsedPercent) || parsedPercent < 1 || parsedPercent > 100) {
      setNotice("Enter a discount percent between 1 and 100.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim() || undefined,
          couponName: `${parsedPercent}% Off Coupon`,
          discountAmount: parsedPercent,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; coupon?: { code: string } };
      setNotice(json.error ?? (json.coupon ? `Coupon ${json.coupon.code} created.` : "Done."));
      await loadCoupons();
    } finally { setCreating(false); }
  };

  const saveCouponSettings = async (nextSettings: CouponSettings) => {
    const limit = nextSettings.issuanceLimit;
    if (!limit || !Number.isInteger(limit.max) || limit.max < 1) {
      setNotice("Enter a valid issuance limit.");
      return;
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
      loadedRef.current.coupon = false;
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
    if (!loadedRef.current[nav]) {
      if (nav === "dashboard") void loadDashboard();
      if (nav === "game") void loadGame();
      if (nav === "coupon") void loadCoupons();
      if (nav === "couponSettings") void loadCouponSettings();
      if (nav === "logs") void loadStore();
      if (nav === "feedback") void loadFeedback();
    }
  }, [nav]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  // ── Nav config ───────────────────────────────────────────────────────────────

  const navItems: { id: NavItem; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "◈" },
    { id: "coupon", label: "Coupon Management", icon: "🎟" },
    { id: "couponSettings", label: "Coupon Settings", icon: "⚙" },
    { id: "game", label: "Game Analytics", icon: "🎮" },
    { id: "users", label: "User Search", icon: "👤" },
    { id: "feedback", label: "Feedback", icon: "💬" },
    { id: "logs", label: "Logs", icon: "📋" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

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
              onClick={() => { setNav(item.id); setSidebarOpen(false); }}
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
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-xl text-[#4f2832]">☰</button>
          <span className="font-black text-[#4f2832]">{navItems.find((n) => n.id === nav)?.label}</span>
          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {nav === "dashboard" && <DashboardSection data={dashStats} loading={dashLoading} onRefresh={loadDashboard} />}
          {nav === "coupon" && <CouponSection coupons={coupons} loading={couponLoading} creating={creating} userId={userId} discountPercent={discountPercent} onUserIdChange={setUserId} onDiscountPercentChange={setDiscountPercent} onCreateCoupon={createCoupon} onRefresh={loadCoupons} />}
          {nav === "couponSettings" && <CouponSettingsSection settings={couponSettings} loading={couponSettingsLoading} saving={couponSettingsSaving} onChange={setCouponSettings} onSave={saveCouponSettings} onRefresh={loadCouponSettings} />}
          {nav === "game" && <GameSection data={gameData} loading={gameLoading} onRefresh={loadGame} />}
          {nav === "users" && <UserSection query={userQuery} results={userResults} loading={userSearchLoading} expiringId={expiringId} onQueryChange={setUserQuery} onSearch={searchUsers} onExpire={expireWalletCoupon} />}
          {nav === "feedback" && <FeedbackSection rows={feedbackRows} loading={feedbackLoading} onRefresh={loadFeedback} />}
          {nav === "logs" && <LogsSection data={storeStats} loading={storeLoading} onRefresh={loadStore} />}
        </main>
      </div>
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────

function DashboardSection({ data, loading, onRefresh }: { data: DashboardStats | null; loading: boolean; onRefresh: () => void }) {
  return (
    <SectionShell title="Dashboard" subtitle="Today's key metrics" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading || !data ? <LoadingCard /> : (
        <>
          {/* KPI row */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total Coupons Issued"
              value={String(data.coupons.issued)}
              sub={data.coupons.issuanceLimit
                ? `${data.coupons.issuanceLimit.current}/${data.coupons.issuanceLimit.max} ${data.coupons.issuanceLimit.type} limit (${data.coupons.issuanceLimit.percentUsed}%)`
                : "Cumulative"}
              color={data.coupons.issuanceLimit?.warning ? "orange" : undefined}
            />
            <KpiCard label="Coupons Redeemed" value={String(data.coupons.redeemed)} sub={`Redeem rate ${data.coupons.redeemRate}%`} color="green" />
            <KpiCard label="Game Sessions (14 days)" value={String(data.game.totalSessions)} sub={`Completion rate ${data.game.completionRate}%`} />
            <KpiCard label="Game-to-Coupon Conversion" value={`${data.game.gameToConversionRate}%`} sub="Based on completed sessions" color="orange" />
          </div>

          {/* Funnel */}
          <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Conversion Funnel (14 Days)</p>
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

          {/* Charts */}
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Daily Coupon Issuance (14 Days)</p>
              <MiniBarChart series={data.charts.issuedByDay} color="bg-[#ff9a76]" />
            </div>
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Daily Coupon Redemption (14 Days)</p>
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

// ─── Section: Coupon Management ───────────────────────────────────────────────

function CouponSection({ coupons, loading, creating, userId, discountPercent, onUserIdChange, onDiscountPercentChange, onCreateCoupon, onRefresh }: {
  coupons: CouponListRow[]; loading: boolean; creating: boolean;
  userId: string;
  discountPercent: string;
  onUserIdChange: (v: string) => void;
  onDiscountPercentChange: (v: string) => void;
  onCreateCoupon: () => void; onRefresh: () => void;
}) {
  return (
    <SectionShell title="Coupon Management" subtitle="Manual issuance and recent coupon activity" onRefresh={onRefresh} loading={loading} csvHref="/api/admin/redeem-logs?format=csv">
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        {/* Manual issue */}
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Manual Issuance</p>
          <div className="mt-4 space-y-3">
            <input value={userId} onChange={(e) => onUserIdChange(e.target.value)} placeholder="User ID (optional)" className="w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
            <input value={discountPercent} onChange={(e) => onDiscountPercentChange(e.target.value.replace(/[^\d]/g, ""))} placeholder="Discount Percent" className="w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
            <button type="button" onClick={onCreateCoupon} disabled={creating} className="w-full rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] py-3 font-black text-white disabled:opacity-60">
              {creating ? "Creating..." : "Create Coupon"}
            </button>
            <p className="text-xs font-semibold text-[#9a6f75]">
              Manual admin coupons are issued using the discount percentage you enter.
            </p>
          </div>

          <div className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#cd6d66]">Coupon Rules (Current)</p>
            <div className="mt-3 space-y-2">
              {[{ score: "30+", reward: "3% off" }, { score: "50+", reward: "5% off" }, { score: "100+", reward: "10% off" }, { score: "150+", reward: "15% off" }].map((r) => (
                <div key={r.score} className="flex items-center justify-between rounded-2xl bg-[#fff9f4] px-4 py-2.5 text-sm">
                  <span className="font-black text-[#4f2832]">{r.score} pts</span>
                  <span className="font-bold text-[#9a6f75]">{r.reward}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-[#c4a0ae]">Maximum 1 per day · Valid for 24 hours</p>
            </div>
          </div>
        </div>

        {/* Coupon list */}
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Recently Issued Coupons</p>
          {loading ? <LoadingCard /> : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-[#9a6f75]">
                    {["Code", "Name", "Discount", "Status", "Expires", "User"].map((h) => (
                      <th key={h} className="pb-3 pr-4 font-black">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.id} className="border-t border-[#f5e4de] text-[#563038]">
                      <td className="py-2.5 pr-4 font-black">{c.code}</td>
                      <td className="py-2.5 pr-4">{c.couponName}</td>
                      <td className="py-2.5 pr-4">{formatCouponValue(c.discountAmount, c.rewardType)}</td>
                      <td className="py-2.5 pr-4 uppercase">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${c.status === "unused" ? "bg-[#e6f9ee] text-[#2a8a50]" : c.status === "used" ? "bg-[#eef0f5] text-[#6b7280]" : "bg-[#fff0e8] text-[#c0602a]"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-[#9a6f75]">{formatDateTime(c.expiresAt)}</td>
                      <td className="py-2.5 text-xs text-[#9a6f75]">{c.userId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  );
}

// ─── Section: Game Analytics ──────────────────────────────────────────────────

function CouponSettingsSection({ settings, loading, saving, onChange, onSave, onRefresh }: {
  settings: CouponSettings | null;
  loading: boolean;
  saving: boolean;
  onChange: (settings: CouponSettings) => void;
  onSave: (settings: CouponSettings) => void;
  onRefresh: () => void;
}) {
  const current = settings ?? {
    issuanceLimit: { type: "daily" as const, max: 500, stopOnReach: true },
    rewardTiers: [
      { threshold: 200, discountPercent: 20 },
      { threshold: 150, discountPercent: 15 },
      { threshold: 100, discountPercent: 10 },
      { threshold: 50, discountPercent: 5 },
      { threshold: 30, discountPercent: 3 },
    ],
    issuanceStats: { dailyIssued: 0, campaignIssued: 0, currentIssued: 0, percentUsed: 0 },
  };
  const limit = current.issuanceLimit ?? { type: "daily" as const, max: 500, stopOnReach: true };

  const updateLimit = (patch: Partial<NonNullable<CouponSettings["issuanceLimit"]>>) => {
    onChange({ ...current, issuanceLimit: { ...limit, ...patch } });
  };
  const updateTier = (index: number, patch: Partial<CouponRewardTier>) => {
    onChange({ ...current, rewardTiers: current.rewardTiers.map((tier, i) => i === index ? { ...tier, ...patch } : tier) });
  };
  const addTier = () => onChange({ ...current, rewardTiers: [...current.rewardTiers, { threshold: 1, discountPercent: 1 }] });
  const removeTier = (index: number) => onChange({ ...current, rewardTiers: current.rewardTiers.filter((_, i) => i !== index) });
  const resetTiers = () => onChange({
    ...current,
    rewardTiers: [
      { threshold: 200, discountPercent: 20 },
      { threshold: 150, discountPercent: 15 },
      { threshold: 100, discountPercent: 10 },
      { threshold: 50, discountPercent: 5 },
      { threshold: 30, discountPercent: 3 },
    ],
  });

  return (
    <SectionShell title="Coupon Settings" subtitle="Issuance limits and score-based reward tiers" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading || !settings ? <LoadingCard /> : (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Issuance Limit</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-[#9a6f75]">
              Daily resets every day. Campaign counts all coupons for the whole promotion.
            </p>
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
              <div className="rounded-2xl bg-[#fff9f4] p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-black text-[#4f2832]">Current Issued</span>
                  <span className="font-black text-[#c0502a]">{current.issuanceStats.currentIssued} / {limit.max}</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#f4ded8]">
                  <div className="h-full rounded-full bg-[#ff8a70]" style={{ width: `${Math.min(100, current.issuanceStats.percentUsed)}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-[#9a6f75]">{current.issuanceStats.percentUsed}% used</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#9a6f75]">When Limit Is Reached</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => updateLimit({ stopOnReach: true })} className={`rounded-2xl border px-3 py-2 text-sm font-black ${limit.stopOnReach ? "border-[#ff8a70] bg-[#fff0e8] text-[#c0502a]" : "border-[#edd9d5] text-[#8a6670]"}`}>Stop Issuing</button>
                  <button type="button" onClick={() => updateLimit({ stopOnReach: false })} className={`rounded-2xl border px-3 py-2 text-sm font-black ${!limit.stopOnReach ? "border-[#ff8a70] bg-[#fff0e8] text-[#c0502a]" : "border-[#edd9d5] text-[#8a6670]"}`}>Warn Only</button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Reward Tiers</p>
              <div className="flex gap-2">
                <button type="button" onClick={addTier} className="rounded-2xl border border-[#edd9d5] px-4 py-2 text-sm font-black text-[#764a56]">Add Tier</button>
                <button type="button" onClick={resetTiers} className="rounded-2xl border border-[#edd9d5] px-4 py-2 text-sm font-black text-[#764a56]">Reset</button>
                <button type="button" onClick={() => onSave(current)} disabled={saving} className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-5 py-2 text-sm font-black text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-[#9a6f75]">
                    {["Tier", "Minimum Score", "Discount", "QR Value", ""].map((h) => <th key={h} className="pb-3 pr-3 font-black">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {current.rewardTiers.map((tier, index) => (
                    <tr key={`${tier.threshold}-${index}`} className="border-t border-[#f5e4de] text-[#563038]">
                      <td className="py-2.5 pr-3 font-black">{index + 1}</td>
                      <td className="py-2.5 pr-3"><input value={String(tier.threshold)} onChange={(e) => updateTier(index, { threshold: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className="w-24 rounded-xl border border-[#edd9d5] px-3 py-2 font-bold outline-none" /></td>
                      <td className="py-2.5 pr-3"><input value={String(tier.discountPercent)} onChange={(e) => updateTier(index, { discountPercent: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className="w-20 rounded-xl border border-[#edd9d5] px-3 py-2 font-bold outline-none" /></td>
                      <td className="py-2.5 pr-3"><input value={tier.fixedQrValue ?? ""} onChange={(e) => updateTier(index, { fixedQrValue: e.target.value })} placeholder="Auto" className="w-52 rounded-xl border border-[#edd9d5] px-3 py-2 text-xs font-bold outline-none" /></td>
                      <td className="py-2.5 text-right"><button type="button" onClick={() => removeTier(index)} disabled={current.rewardTiers.length <= 1} className="rounded-xl border border-[#f0ccc5] px-3 py-1.5 text-xs font-black text-[#c0502a] disabled:opacity-40">Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function GameSection({ data, loading, onRefresh }: { data: GameAnalytics | null; loading: boolean; onRefresh: () => void }) {
  return (
    <SectionShell title="Game Analytics" subtitle="Session-based gameplay metrics" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading || !data ? <LoadingCard /> : data.totalSessions === 0 ? (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-10 text-center">
          <p className="text-4xl">🎮</p>
          <p className="mt-3 font-black text-[#4f2832]">No game session data yet</p>
          <p className="mt-1 text-sm text-[#9a6f75]">Data will be collected automatically once the game is played.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Sessions" value={String(data.totalSessions)} sub="Cumulative" />
            <KpiCard label="Average Score" value={String(data.avgScore)} sub="pts" color="orange" />
            <KpiCard label="Average Play Time" value={data.avgPlayTimeSec != null ? `${data.avgPlayTimeSec}s` : "-"} sub="" />
            <KpiCard label="Coupon Conversion Rate" value={`${data.couponIssuedRate}%`} sub={`${data.couponIssuedCount} issued`} color="green" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Sessions by day */}
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Daily Sessions (14 Days)</p>
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
                  {s.coupon_issued && <span className="rounded-full bg-[#e6f9ee] px-2 py-0.5 text-[10px] font-black text-[#2a8a50]">Coupon Issued</span>}
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

// ─── Section: Store Analytics ─────────────────────────────────────────────────

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

// ─── Section: User Search ─────────────────────────────────────────────────────

function UserSection({ query, results, loading, expiringId, onQueryChange, onSearch, onExpire }: {
  query: string; results: UserEntry[]; loading: boolean; expiringId: number | null;
  onQueryChange: (v: string) => void; onSearch: () => void;
  onExpire: (couponId: number, entryId: number) => void;
}) {
  return (
    <SectionShell title="User Search" subtitle="Look up users and coupons by nickname" onRefresh={onSearch} loading={loading} csvHref={undefined}>
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
                {user.contact_type ? `${user.contact_type}: ${user.contact_value}` : "No contact info"} · Joined {formatDateTime(user.created_at)}
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
                    <p className="mt-0.5 text-xs text-[#b89aa5]">Issued {formatDateTime(c.created_at)} · Expires {formatDateTime(c.expires_at)}</p>
                  </div>
                  {c.status === "active" && (
                    <button type="button" onClick={() => onExpire(c.id, user.id)} disabled={expiringId === c.id}
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

// ─── Section: Feedback ────────────────────────────────────────────────────────

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
                {row.nickname ? `@${row.nickname}` : "Anonymous"}{row.store ? ` · ${row.store}` : ""}{row.source ? ` · ${row.source}` : ""}
                <span className="ml-2 text-[#c4a0ae]">{formatDateTime(row.created_at)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── Section: Logs ────────────────────────────────────────────────────────────

function LogsSection({ data, loading, onRefresh }: { data: StoreStats | null; loading: boolean; onRefresh: () => void }) {
  return (
    <SectionShell title="Logs" subtitle="Coupon redemption processing logs" onRefresh={onRefresh} loading={loading} csvHref="/api/admin/redeem-logs?format=csv">
      {loading || !data ? <LoadingCard /> : (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          {data.recentLogs.length === 0 ? (
            <p className="text-sm text-[#9a6f75]">No logs available.</p>
          ) : (
            <div className="space-y-3">
              {data.recentLogs.map((log) => (
                <div key={log.id} className="rounded-2xl bg-[#fff9f4] p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black text-[#4f2832]">{log.code}</span>
                    <span className="rounded-full bg-[#fff0e8] px-2 py-0.5 text-xs font-black text-[#c0602a]">{log.action_type}</span>
                  </div>
                  {log.reason && <p className="mt-1 text-[#6b5058]">{log.reason}</p>}
                  <p className="mt-1 text-xs text-[#9a6f75]">
                    {log.store_id ?? "-"} / {log.staff_id ?? "-"} · {formatDateTime(log.created_at)}
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

// ─── Shared UI Components ─────────────────────────────────────────────────────

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
