"use client";

import { useEffect, useRef, useState } from "react";

import { formatCurrency, formatDateTime } from "../lib/couponMvp";

// ─── Types ───────────────────────────────────────────────────────────────────

type DashboardStats = {
  coupons: { issued: number; redeemed: number; expired: number; active: number; redeemRate: number };
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

type NavItem = "dashboard" | "coupon" | "game" | "store" | "users" | "feedback" | "logs";

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
  const [discountAmount, setDiscountAmount] = useState("3000");

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

  const loadStore = async () => {
    setStoreLoading(true);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      setStoreStats((await res.json()) as StoreStats);
      loadedRef.current.store = true;
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
    setCreating(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId.trim() || undefined, couponName: "3,000 KRW Off Coupon", discountAmount: Number(discountAmount) }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; coupon?: { code: string } };
      setNotice(json.error ?? (json.coupon ? `쿠폰 ${json.coupon.code} 생성됨` : "완료"));
      await loadCoupons();
    } finally { setCreating(false); }
  };

  const searchUsers = async () => {
    const q = userQuery.trim();
    if (q.length < 2) { setNotice("닉네임을 2자 이상 입력하세요."); return; }
    setUserSearchLoading(true);
    setUserResults([]);
    try {
      const res = await fetch(`/api/admin/user-wallet?nickname=${encodeURIComponent(q)}`, { cache: "no-store" });
      const json = (await res.json()) as { entries?: UserEntry[]; error?: string };
      if (json.error) { setNotice(json.error); return; }
      setUserResults(json.entries ?? []);
      if ((json.entries ?? []).length === 0) setNotice("검색 결과가 없습니다.");
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
      setNotice("쿠폰이 만료 처리됐습니다.");
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
      if (nav === "store" || nav === "logs") void loadStore();
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
    { id: "coupon", label: "쿠폰 관리", icon: "🎟" },
    { id: "game", label: "게임 분석", icon: "🎮" },
    { id: "store", label: "매장 분석", icon: "🏪" },
    { id: "users", label: "유저 검색", icon: "👤" },
    { id: "feedback", label: "피드백", icon: "💬" },
    { id: "logs", label: "로그", icon: "📋" },
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
          {nav === "coupon" && <CouponSection coupons={coupons} loading={couponLoading} creating={creating} userId={userId} discountAmount={discountAmount} onUserIdChange={setUserId} onAmountChange={setDiscountAmount} onCreateCoupon={createCoupon} onRefresh={loadCoupons} />}
          {nav === "game" && <GameSection data={gameData} loading={gameLoading} onRefresh={loadGame} />}
          {nav === "store" && <StoreSection data={storeStats} loading={storeLoading} onRefresh={loadStore} />}
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
    <SectionShell title="Dashboard" subtitle="오늘의 핵심 지표" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading || !data ? <LoadingCard /> : (
        <>
          {/* KPI row */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="총 쿠폰 발급" value={String(data.coupons.issued)} sub="누적" />
            <KpiCard label="쿠폰 사용" value={String(data.coupons.redeemed)} sub={`사용률 ${data.coupons.redeemRate}%`} color="green" />
            <KpiCard label="게임 세션 (14일)" value={String(data.game.totalSessions)} sub={`완료율 ${data.game.completionRate}%`} />
            <KpiCard label="게임→쿠폰 전환율" value={`${data.game.gameToConversionRate}%`} sub="완료 세션 기준" color="orange" />
          </div>

          {/* Funnel */}
          <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">전환 퍼널 (14일)</p>
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
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">일별 쿠폰 발급 (14일)</p>
              <MiniBarChart series={data.charts.issuedByDay} color="bg-[#ff9a76]" />
            </div>
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">일별 쿠폰 사용 (14일)</p>
              <MiniBarChart series={data.charts.redeemedByDay} color="bg-[#46b874]" />
            </div>
          </div>

          {/* Recent redeems */}
          {data.recentRedeems.length > 0 && (
            <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">최근 사용 로그</p>
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

function CouponSection({ coupons, loading, creating, userId, discountAmount, onUserIdChange, onAmountChange, onCreateCoupon, onRefresh }: {
  coupons: CouponListRow[]; loading: boolean; creating: boolean;
  userId: string; discountAmount: string;
  onUserIdChange: (v: string) => void; onAmountChange: (v: string) => void;
  onCreateCoupon: () => void; onRefresh: () => void;
}) {
  return (
    <SectionShell title="쿠폰 관리" subtitle="수동 발급 및 최근 발급 현황" onRefresh={onRefresh} loading={loading} csvHref="/api/admin/redeem-logs?format=csv">
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        {/* Manual issue */}
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">수동 발급</p>
          <div className="mt-4 space-y-3">
            <input value={userId} onChange={(e) => onUserIdChange(e.target.value)} placeholder="User ID (선택)" className="w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
            <input value={discountAmount} onChange={(e) => onAmountChange(e.target.value.replace(/[^\d]/g, ""))} placeholder="할인 금액 (원)" className="w-full rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
            <button type="button" onClick={onCreateCoupon} disabled={creating} className="w-full rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] py-3 font-black text-white disabled:opacity-60">
              {creating ? "생성 중..." : "쿠폰 생성"}
            </button>
          </div>

          <div className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#cd6d66]">쿠폰 규칙 (현행)</p>
            <div className="mt-3 space-y-2">
              {[{ score: "30+", reward: "3% 할인" }, { score: "50+", reward: "5% 할인" }, { score: "100+", reward: "10% 할인" }, { score: "150+", reward: "15% 할인" }].map((r) => (
                <div key={r.score} className="flex items-center justify-between rounded-2xl bg-[#fff9f4] px-4 py-2.5 text-sm">
                  <span className="font-black text-[#4f2832]">{r.score}점</span>
                  <span className="font-bold text-[#9a6f75]">{r.reward}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-[#c4a0ae]">하루 최대 2개 · 유효기간 48시간</p>
            </div>
          </div>
        </div>

        {/* Coupon list */}
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">최근 발급 쿠폰</p>
          {loading ? <LoadingCard /> : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-[#9a6f75]">
                    {["코드", "이름", "금액", "상태", "만료", "유저"].map((h) => (
                      <th key={h} className="pb-3 pr-4 font-black">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.id} className="border-t border-[#f5e4de] text-[#563038]">
                      <td className="py-2.5 pr-4 font-black">{c.code}</td>
                      <td className="py-2.5 pr-4">{c.couponName}</td>
                      <td className="py-2.5 pr-4">{formatCurrency(c.discountAmount)}</td>
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

function GameSection({ data, loading, onRefresh }: { data: GameAnalytics | null; loading: boolean; onRefresh: () => void }) {
  return (
    <SectionShell title="게임 분석" subtitle="플레이 세션 기반 통계" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading || !data ? <LoadingCard /> : data.totalSessions === 0 ? (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-10 text-center">
          <p className="text-4xl">🎮</p>
          <p className="mt-3 font-black text-[#4f2832]">아직 게임 세션 데이터가 없습니다</p>
          <p className="mt-1 text-sm text-[#9a6f75]">게임이 플레이되면 자동으로 수집됩니다.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="총 세션" value={String(data.totalSessions)} sub="누적" />
            <KpiCard label="평균 점수" value={String(data.avgScore)} sub="pts" color="orange" />
            <KpiCard label="평균 플레이시간" value={data.avgPlayTimeSec != null ? `${data.avgPlayTimeSec}초` : "-"} sub="" />
            <KpiCard label="쿠폰 전환율" value={`${data.couponIssuedRate}%`} sub={`${data.couponIssuedCount}건 발급`} color="green" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Sessions by day */}
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">일별 세션 (14일)</p>
              <MiniBarChart series={data.sessionsByDay} color="bg-[#a78bfa]" />
            </div>

            {/* Score distribution */}
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">점수 분포</p>
              {data.scoreDistribution.length === 0 ? (
                <p className="mt-4 text-sm text-[#9a6f75]">데이터 없음</p>
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
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">최근 세션</p>
            <div className="mt-3 space-y-2">
              {data.recentSessions.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#fff9f4] px-4 py-2.5 text-sm">
                  <span className="font-black text-[#4f2832]">{s.score}pts</span>
                  <span className="text-xs text-[#9a6f75]">{s.nickname_key ?? "익명"}</span>
                  <span className="text-xs text-[#9a6f75]">{s.mode}</span>
                  {s.coupon_issued && <span className="rounded-full bg-[#e6f9ee] px-2 py-0.5 text-[10px] font-black text-[#2a8a50]">쿠폰발급</span>}
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
    <SectionShell title="매장 분석" subtitle="오프라인 매장별 쿠폰 사용 현황" onRefresh={onRefresh} loading={loading} csvHref="/api/admin/redeem-logs?format=csv">
      {loading || !data ? <LoadingCard /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="총 발급" value={String(data.totals.issued)} sub="누적" />
            <KpiCard label="사용됨" value={String(data.totals.redeemed)} sub={`사용률 ${data.totals.usageRate}%`} color="green" />
            <KpiCard label="만료됨" value={String(data.statusCounts.expired)} sub="" />
          </div>

          <div className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">매장별 사용량</p>
            {data.storeUsage.length === 0 ? (
              <p className="mt-3 text-sm text-[#9a6f75]">아직 매장 사용 기록이 없습니다.</p>
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
                      <span className="text-right text-sm font-black text-[#5b343d]">{item.count}회</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">일별 발급</p>
              <MiniBarChart series={data.charts.issuedByDay} color="bg-[#ff9a76]" />
            </div>
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">일별 사용</p>
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
    <SectionShell title="유저 검색" subtitle="닉네임으로 유저 및 쿠폰 조회" onRefresh={onSearch} loading={loading} csvHref={undefined}>
      <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
        <div className="flex gap-3">
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder="닉네임 (2자 이상)" className="flex-1 rounded-2xl border border-[#edd9d5] px-4 py-3 text-sm font-bold text-[#4d2931] outline-none" />
          <button type="button" onClick={onSearch} disabled={loading} className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-6 text-sm font-black text-white disabled:opacity-60">
            {loading ? "검색 중..." : "검색"}
          </button>
        </div>
      </div>

      {results.map((user) => (
        <div key={user.id} className="mt-4 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black text-[#4f2832]">{user.nickname_display || user.nickname_key}</p>
              <p className="mt-0.5 text-xs text-[#9a6f75]">
                {user.contact_type ? `${user.contact_type}: ${user.contact_value}` : "연락처 없음"} · 가입 {formatDateTime(user.created_at)}
              </p>
            </div>
            <span className="rounded-full bg-[#fff0f0] px-3 py-1 text-xs font-black text-[#cd6d66]">쿠폰 {user.walletCoupons.length}개</span>
          </div>

          {user.walletCoupons.length === 0 ? (
            <p className="mt-3 text-sm text-[#b89aa5]">발급된 쿠폰 없음</p>
          ) : (
            <div className="mt-3 space-y-2">
              {user.walletCoupons.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f5e4de] bg-[#fff9f4] px-4 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-[#4f2832]">{c.title}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-[#b89aa5]">발급 {formatDateTime(c.created_at)} · 만료 {formatDateTime(c.expires_at)}</p>
                  </div>
                  {c.status === "active" && (
                    <button type="button" onClick={() => onExpire(c.id, user.id)} disabled={expiringId === c.id}
                      className="rounded-xl border border-[#f0ccc5] bg-white px-3 py-1.5 text-xs font-black text-[#c0502a] disabled:opacity-50">
                      {expiringId === c.id ? "처리 중..." : "수동 만료"}
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
    <SectionShell title="피드백" subtitle="유저 피드백 목록" onRefresh={onRefresh} loading={loading} csvHref={undefined}>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#f5ede9]" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-8 text-center text-sm text-[#b89aa5]">피드백이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-[#f0ddd8] bg-white p-4">
              <p className="font-semibold text-[#4f2832]">{row.message}</p>
              <p className="mt-1.5 text-xs text-[#9a6f75]">
                {row.nickname ? `@${row.nickname}` : "익명"}{row.store ? ` · ${row.store}` : ""}{row.source ? ` · ${row.source}` : ""}
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
    <SectionShell title="로그" subtitle="쿠폰 사용 처리 로그" onRefresh={onRefresh} loading={loading} csvHref="/api/admin/redeem-logs?format=csv">
      {loading || !data ? <LoadingCard /> : (
        <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
          {data.recentLogs.length === 0 ? (
            <p className="text-sm text-[#9a6f75]">로그가 없습니다.</p>
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
            <a href={csvHref} className="rounded-2xl border border-[#ecd9d2] px-4 py-2.5 text-sm font-black text-[#764a56]">CSV 다운로드</a>
          )}
          <button type="button" onClick={onRefresh} disabled={loading}
            className="rounded-2xl border border-[#ecd9d2] px-4 py-2.5 text-sm font-black text-[#764a56] disabled:opacity-50">
            {loading ? "로딩 중..." : "새로고침"}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-[#e6f9ee] text-[#2a8a50]",
    used: "bg-[#eef0f5] text-[#6b7280]",
    expired: "bg-[#fff0e8] text-[#c0602a]",
  };
  const labels: Record<string, string> = { active: "활성", used: "사용됨", expired: "만료됨" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-black ${map[status] ?? "bg-[#f5ede9] text-[#9a6f75]"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-10 text-center text-sm font-bold text-[#9a6f75]">
      로딩 중...
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
