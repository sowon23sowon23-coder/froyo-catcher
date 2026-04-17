"use client";

import { useEffect, useState } from "react";

import { formatCurrency, formatDateTime } from "../lib/couponMvp";

type StatsResponse = {
  totals: { issued: number; redeemed: number; usageRate: number };
  statusCounts: { unused: number; used: number; expired: number };
  recentLogs: Array<{
    id: number;
    code: string;
    action_type: string;
    reason: string;
    store_id: string | null;
    staff_id: string | null;
    order_number: string | null;
    created_at: string;
  }>;
  charts: {
    issuedByDay: Array<{ date: string; count: number }>;
    redeemedByDay: Array<{ date: string; count: number }>;
  };
  storeUsage: Array<{ storeId: string; count: number }>;
};

type CouponListResponse = {
  rows: Array<{
    id: number;
    code: string;
    couponName: string;
    discountAmount: number;
    status: string;
    expiresAt: string;
    userId: string | null;
  }>;
};

type WalletCoupon = {
  id: number;
  title: string;
  reward_type: string;
  status: string;
  expires_at: string;
  created_at: string;
  redeemed_at: string | null;
};

type UserEntry = {
  id: number;
  nickname_display: string;
  nickname_key: string;
  contact_type: string | null;
  contact_value: string | null;
  created_at: string;
  walletCoupons: WalletCoupon[];
};

type FeedbackRow = {
  id: number;
  message: string;
  nickname: string | null;
  store: string | null;
  source: string | null;
  created_at: string;
};

type AdminTab = "stats" | "users" | "feedback";

export default function AdminDashboardClient() {
  const [activeTab, setActiveTab] = useState<AdminTab>("stats");

  // Stats tab state
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [coupons, setCoupons] = useState<CouponListResponse["rows"]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("3000");

  // Users tab state
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserEntry[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [expiringId, setExpiringId] = useState<number | null>(null);

  // Feedback tab state
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const [statsRes, couponsRes] = await Promise.all([
        fetch("/api/admin/stats", { cache: "no-store" }),
        fetch("/api/admin/coupons?limit=10", { cache: "no-store" }),
      ]);
      const statsJson = (await statsRes.json()) as StatsResponse;
      const couponsJson = (await couponsRes.json()) as CouponListResponse;
      setStats(statsJson);
      setCoupons(couponsJson.rows || []);
    } finally {
      setStatsLoading(false);
    }
  };

  const createCoupon = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim() || undefined,
          couponName: "3,000 KRW Off Coupon",
          discountAmount: Number(discountAmount),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; coupon?: { code: string } };
      setNotice(json.error || (json.coupon ? `Coupon ${json.coupon.code} created.` : "Done."));
      await loadStats();
    } finally {
      setCreating(false);
    }
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
    } finally {
      setUserSearchLoading(false);
    }
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
        prev.map((u) =>
          u.id === entryId
            ? {
                ...u,
                walletCoupons: u.walletCoupons.map((c) =>
                  c.id === couponId ? { ...c, status: "expired" } : c,
                ),
              }
            : u,
        ),
      );
    } finally {
      setExpiringId(null);
    }
  };

  const loadFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/admin/feedback-view", { cache: "no-store" });
      const json = (await res.json()) as { rows?: FeedbackRow[]; error?: string };
      if (json.error) { setNotice(json.error); return; }
      setFeedbackRows(json.rows ?? []);
      setFeedbackLoaded(true);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login?next=/admin";
  };

  useEffect(() => {
    if (activeTab === "stats" && !stats) void loadStats();
    if (activeTab === "feedback" && !feedbackLoaded) void loadFeedback();
  }, [activeTab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <main className="min-h-screen bg-[#fff8f3] px-4 py-6">
      {notice ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-[#f2d9d0] bg-white px-4 py-3 text-center text-sm font-black text-[#7f4854] shadow-lg">
          {notice}
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-[#f0ddd8] bg-white p-5 shadow-[0_20px_40px_rgba(158,108,87,0.12)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ec7d5d]">Admin Dashboard</p>
            <h1 className="text-4xl font-black text-[#4f2832]">Operations Portal</h1>
          </div>
          <div className="flex gap-2">
            {activeTab === "stats" ? (
              <a
                href="/api/admin/redeem-logs?format=csv"
                className="rounded-2xl border border-[#ecd9d2] px-4 py-3 text-sm font-black text-[#764a56]"
              >
                Download CSV
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-2xl bg-[#4f2832] px-4 py-3 text-sm font-black text-white"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2 rounded-[1.75rem] border border-[#f0ddd8] bg-white p-2 shadow-[0_16px_30px_rgba(158,108,87,0.08)]">
          {(["stats", "users", "feedback"] as AdminTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                activeTab === tab
                  ? "bg-[linear-gradient(135deg,#ff9473,#ff6675)] text-white"
                  : "bg-[#fff7f1] text-[#764a56]"
              }`}
            >
              {tab === "stats" ? "통계" : tab === "users" ? "유저 검색" : "피드백"}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {activeTab === "stats" ? (
          statsLoading || !stats ? (
            <div className="rounded-[2rem] border border-[#f0ddd8] bg-white p-10 text-center text-lg font-bold text-[#87626b]">
              Loading dashboard...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard label="Total Issued" value={String(stats.totals.issued)} />
                <StatCard label="Total Redeemed" value={String(stats.totals.redeemed)} />
                <StatCard label="Usage Rate" value={`${stats.totals.usageRate}%`} />
                <StatCard label="Expired" value={String(stats.statusCounts.expired)} />
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Issued / Redeemed by Day</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <MiniChart title="Issued" series={stats.charts.issuedByDay} color="bg-[#ff9a76]" />
                    <MiniChart title="Redeemed" series={stats.charts.redeemedByDay} color="bg-[#46b874]" />
                  </div>
                </section>

                <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Coupons by Status</p>
                  <div className="mt-4 space-y-3">
                    <StatusRow label="Unused" count={stats.statusCounts.unused} color="bg-[#4abf71]" />
                    <StatusRow label="Used" count={stats.statusCounts.used} color="bg-[#7c8595]" />
                    <StatusRow label="Expired" count={stats.statusCounts.expired} color="bg-[#ff9a4f]" />
                  </div>
                </section>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Admin Manual Issue</p>
                  <div className="mt-4 grid gap-3">
                    <input
                      value={userId}
                      onChange={(event) => setUserId(event.target.value)}
                      placeholder="User ID (optional)"
                      className="rounded-2xl border border-[#edd9d5] px-4 py-3 text-base font-bold text-[#4d2931] outline-none"
                    />
                    <input
                      value={discountAmount}
                      onChange={(event) => setDiscountAmount(event.target.value.replace(/[^\d]/g, ""))}
                      placeholder="Discount amount"
                      className="rounded-2xl border border-[#edd9d5] px-4 py-3 text-base font-bold text-[#4d2931] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void createCoupon()}
                      disabled={creating}
                      className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-4 py-4 text-lg font-black text-white disabled:opacity-60"
                    >
                      {creating ? "Creating..." : "Create Coupon"}
                    </button>
                  </div>

                  <div className="mt-6">
                    <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Redeems by Store</p>
                    <div className="mt-3 space-y-2">
                      {stats.storeUsage.length === 0 ? (
                        <p className="text-sm font-semibold text-[#8a6670]">No redeem history yet.</p>
                      ) : (
                        stats.storeUsage.map((item) => (
                          <div
                            key={item.storeId}
                            className="flex items-center justify-between rounded-2xl bg-[#fff7f1] px-4 py-3 text-sm font-bold text-[#5a3139]"
                          >
                            <span>{item.storeId}</span>
                            <span>{item.count} uses</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Recent Logs</p>
                  <div className="mt-4 space-y-3">
                    {stats.recentLogs.map((log) => (
                      <div key={log.id} className="rounded-2xl bg-[#fff9f4] p-4 text-sm font-semibold text-[#5e3940]">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-black">{log.code}</span>
                          <span>{log.action_type}</span>
                        </div>
                        <p className="mt-1">{log.reason}</p>
                        <p className="mt-1 text-xs text-[#8f6871]">
                          {log.store_id || "-"} / {log.staff_id || "-"} / {formatDateTime(log.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="mt-5 rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
                <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Recently Issued Coupons</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-[#9a6f75]">
                        <th className="pb-3 pr-4 font-black">Code</th>
                        <th className="pb-3 pr-4 font-black">Name</th>
                        <th className="pb-3 pr-4 font-black">Amount</th>
                        <th className="pb-3 pr-4 font-black">Status</th>
                        <th className="pb-3 pr-4 font-black">Expires</th>
                        <th className="pb-3 font-black">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((coupon) => (
                        <tr key={coupon.id} className="border-t border-[#f5e4de] text-[#563038]">
                          <td className="py-3 pr-4 font-black">{coupon.code}</td>
                          <td className="py-3 pr-4">{coupon.couponName}</td>
                          <td className="py-3 pr-4">{formatCurrency(coupon.discountAmount)}</td>
                          <td className="py-3 pr-4 uppercase">{coupon.status}</td>
                          <td className="py-3 pr-4">{formatDateTime(coupon.expiresAt)}</td>
                          <td className="py-3">{coupon.userId || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )
        ) : null}

        {/* Users tab */}
        {activeTab === "users" ? (
          <div className="space-y-5">
            <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-6">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">유저 검색</p>
              <h2 className="mt-1 text-2xl font-black text-[#4f2832]">닉네임으로 유저 및 쿠폰 조회</h2>
              <div className="mt-5 flex gap-3">
                <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void searchUsers(); }}
                  placeholder="닉네임 입력 (2자 이상)"
                  className="flex-1 rounded-2xl border border-[#edd9d5] px-4 py-3 text-base font-bold text-[#4d2931] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void searchUsers()}
                  disabled={userSearchLoading}
                  className="rounded-2xl bg-[linear-gradient(135deg,#ff9473,#ff6675)] px-6 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {userSearchLoading ? "검색 중..." : "검색"}
                </button>
              </div>
            </section>

            {userResults.length > 0 ? (
              <div className="space-y-4">
                {userResults.map((user) => (
                  <section key={user.id} className="rounded-[2rem] border border-[#f0ddd8] bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-black text-[#4f2832]">{user.nickname_display || user.nickname_key}</p>
                        <p className="mt-0.5 text-sm font-semibold text-[#9a6f75]">
                          {user.contact_type ? `${user.contact_type}: ${user.contact_value}` : "연락처 없음"}
                          <span className="ml-3 text-xs text-[#c4a0ae]">가입: {formatDateTime(user.created_at)}</span>
                        </p>
                      </div>
                      <span className="rounded-full bg-[#fff0f0] px-3 py-1 text-xs font-black text-[#cd6d66]">
                        쿠폰 {user.walletCoupons.length}개
                      </span>
                    </div>

                    {user.walletCoupons.length === 0 ? (
                      <p className="mt-4 text-sm font-semibold text-[#b89aa5]">발급된 쿠폰이 없습니다.</p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {user.walletCoupons.map((coupon) => (
                          <div
                            key={coupon.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f5e4de] bg-[#fff9f4] px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-[#4f2832]">{coupon.title}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-black ${
                                    coupon.status === "active"
                                      ? "bg-[#e6f9ee] text-[#2a8a50]"
                                      : coupon.status === "used"
                                        ? "bg-[#eef0f5] text-[#6b7280]"
                                        : "bg-[#fff0e8] text-[#c0602a]"
                                  }`}
                                >
                                  {coupon.status === "active" ? "활성" : coupon.status === "used" ? "사용됨" : "만료됨"}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-[#b89aa5]">
                                발급: {formatDateTime(coupon.created_at)} · 만료: {formatDateTime(coupon.expires_at)}
                              </p>
                            </div>
                            {coupon.status === "active" ? (
                              <button
                                type="button"
                                onClick={() => void expireWalletCoupon(coupon.id, user.id)}
                                disabled={expiringId === coupon.id}
                                className="rounded-xl border border-[#f0ccc5] bg-white px-3 py-2 text-xs font-black text-[#c0502a] disabled:opacity-50"
                              >
                                {expiringId === coupon.id ? "처리 중..." : "수동 만료"}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Feedback tab */}
        {activeTab === "feedback" ? (
          <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">피드백</p>
                <h2 className="mt-1 text-2xl font-black text-[#4f2832]">유저 피드백 목록</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadFeedback()}
                disabled={feedbackLoading}
                className="rounded-2xl border border-[#ecd9d2] px-4 py-3 text-sm font-black text-[#764a56] disabled:opacity-50"
              >
                {feedbackLoading ? "로딩 중..." : "새로고침"}
              </button>
            </div>

            {feedbackLoading ? (
              <div className="mt-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#f5ede9]" />
                ))}
              </div>
            ) : feedbackRows.length === 0 ? (
              <p className="mt-6 text-sm font-semibold text-[#b89aa5]">피드백이 없습니다.</p>
            ) : (
              <div className="mt-6 space-y-3">
                {feedbackRows.map((row) => (
                  <div key={row.id} className="rounded-2xl bg-[#fff9f4] p-4">
                    <p className="font-semibold text-[#4f2832]">{row.message}</p>
                    <p className="mt-2 text-xs text-[#9a6f75]">
                      {row.nickname ? `@${row.nickname}` : "익명"}
                      {row.store ? ` · ${row.store}` : ""}
                      {row.source ? ` · ${row.source}` : ""}
                      <span className="ml-2 text-[#c4a0ae]">{formatDateTime(row.created_at)}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-[#f0ddd8] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c36b66]">{label}</p>
      <p className="mt-2 text-4xl font-black text-[#4f2832]">{value}</p>
    </div>
  );
}

function StatusRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr_56px] items-center gap-3">
      <span className="text-sm font-black text-[#5b343d]">{label}</span>
      <div className="h-4 rounded-full bg-[#f5ede9]">
        <div className={`h-4 rounded-full ${color}`} style={{ width: `${Math.min(100, count * 12)}%` }} />
      </div>
      <span className="text-right text-sm font-black text-[#5b343d]">{count}</span>
    </div>
  );
}

function MiniChart({
  title,
  series,
  color,
}: {
  title: string;
  series: Array<{ date: string; count: number }>;
  color: string;
}) {
  const max = Math.max(...series.map((item) => item.count), 1);
  return (
    <div className="rounded-[1.5rem] bg-[#fff9f4] p-4">
      <p className="text-sm font-black text-[#5c3540]">{title}</p>
      <div className="mt-4 flex h-44 items-end gap-2">
        {series.map((item) => (
          <div key={item.date} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className={`w-full rounded-t-xl ${color}`} style={{ height: `${Math.max(12, (item.count / max) * 100)}%` }} />
            <span className="text-[10px] font-black text-[#8a6870]">{item.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
