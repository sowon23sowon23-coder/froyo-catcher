"use client";

import { useEffect, useState } from "react";

import { formatCurrency, formatDateTime } from "../lib/couponMvp";

type StatsResponse = {
  totals: {
    issued: number;
    redeemed: number;
    usageRate: number;
  };
  statusCounts: {
    unused: number;
    used: number;
    expired: number;
  };
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

type AdminTab = "staff" | "admin";

export default function AdminDashboardClient() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [coupons, setCoupons] = useState<CouponListResponse["rows"]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("3000");
  const [activeTab, setActiveTab] = useState<AdminTab>("staff");

  const load = async () => {
    setLoading(true);
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
      setLoading(false);
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
      await load();
    } finally {
      setCreating(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login?next=/admin";
  };

  useEffect(() => {
    if (activeTab !== "admin") return;
    void load();
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-[#f0ddd8] bg-white p-5 shadow-[0_20px_40px_rgba(158,108,87,0.12)]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ec7d5d]">Admin Dashboard</p>
            <h1 className="text-4xl font-black text-[#4f2832]">Operations Portal</h1>
          </div>
          <div className="flex gap-2">
            {activeTab === "admin" ? (
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

        <div className="mb-5 flex flex-wrap gap-2 rounded-[1.75rem] border border-[#f0ddd8] bg-white p-2 shadow-[0_16px_30px_rgba(158,108,87,0.08)]">
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
              activeTab === "staff"
                ? "bg-[linear-gradient(135deg,#ff9473,#ff6675)] text-white"
                : "bg-[#fff7f1] text-[#764a56]"
            }`}
          >
            Staff
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("admin")}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
              activeTab === "admin"
                ? "bg-[linear-gradient(135deg,#ff9473,#ff6675)] text-white"
                : "bg-[#fff7f1] text-[#764a56]"
            }`}
          >
            Admin
          </button>
        </div>

        {activeTab === "staff" ? (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-6">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Staff Tools</p>
              <h2 className="mt-2 text-3xl font-black text-[#4f2832]">Open staff workflows quickly</h2>
              <p className="mt-3 text-sm font-bold text-[#8a6670]">
                Use this tab when store staff need to redeem coupons or move into coupon operations.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <a
                  href="/redeem"
                  className="rounded-[1.75rem] border border-[#f2ded8] bg-[linear-gradient(135deg,#fff1eb,#ffe1d4)] p-5"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#d46f62]">Staff Login</p>
                  <h3 className="mt-2 text-xl font-black text-[#4f2832]">Open redeem page</h3>
                  <p className="mt-2 text-sm font-bold text-[#7d5660]">
                    Staff can log in here to validate and redeem customer coupons.
                  </p>
                </a>

                <button
                  type="button"
                  onClick={() => setActiveTab("admin")}
                  className="rounded-[1.75rem] border border-[#f2ded8] bg-[#fff9f4] p-5 text-left"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#d46f62]">Admin Tools</p>
                  <h3 className="mt-2 text-xl font-black text-[#4f2832]">Open admin dashboard</h3>
                  <p className="mt-2 text-sm font-bold text-[#7d5660]">
                    Switch to the admin tab for coupon analytics, manual issuance, and recent logs.
                  </p>
                </button>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[#f0ddd8] bg-white p-6">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#cd6d66]">Guide</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-[1.5rem] bg-[#fff8f3] p-4">
                  <p className="text-sm font-black text-[#4f2832]">Staff tab</p>
                  <p className="mt-1 text-sm font-bold text-[#8a6670]">
                    Best for store staff who need to get into coupon redemption fast.
                  </p>
                </div>
                <div className="rounded-[1.5rem] bg-[#fff8f3] p-4">
                  <p className="text-sm font-black text-[#4f2832]">Admin tab</p>
                  <p className="mt-1 text-sm font-bold text-[#8a6670]">
                    Best for managers who need coupon status, logs, exports, and manual issue controls.
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : loading || !stats ? (
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
                        <div key={item.storeId} className="flex items-center justify-between rounded-2xl bg-[#fff7f1] px-4 py-3 text-sm font-bold text-[#5a3139]">
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
        )}
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
