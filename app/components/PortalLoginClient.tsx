"use client";

import { useState } from "react";

type PortalRole = "staff" | "admin";

export default function PortalLoginClient({ nextPath }: { nextPath: string }) {
  const adminOnly = nextPath.startsWith("/admin");
  const [role, setRole] = useState<PortalRole>(adminOnly ? "admin" : "staff");
  const [password, setPassword] = useState("");
  const [storeId, setStoreId] = useState("pohang_01");
  const [staffId, setStaffId] = useState("staff_02");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      const body =
        role === "admin"
          ? { role, password }
          : {
              role,
              password,
              storeId,
              staffId,
            };

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; session?: { role: PortalRole } };

      if (!res.ok) {
        setError(json.error || "Login failed.");
        return;
      }

      const fallback = json.session?.role === "admin" ? "/admin" : "/redeem";
      window.location.href = nextPath || fallback;
    } catch {
      setError("An error occurred while logging in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fffaf2_0%,#ffe8ef_45%,#ffd8d8_100%)] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-[2rem] border border-[#f4c7d7] bg-white/95 p-6 shadow-[0_24px_60px_rgba(167,71,95,0.18)]">
          {adminOnly ? (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="rounded-full border border-[#f0ccd6] px-4 py-2 text-sm font-black text-[#874c5c]"
            >
              Back
            </button>
          ) : null}
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#c05a71]">Yogurtland Portal</p>
          <h1 className="mt-2 text-4xl font-black leading-none text-[#5d2735]">
            {adminOnly ? "Admin Login" : "Coupon Operations Login"}
          </h1>
          <p className="mt-3 text-sm font-semibold text-[#855161]">
            {adminOnly
              ? "Enter the admin password to open the operations dashboard."
              : "Staff members go to the redeem console, and admins go to the stats dashboard."}
          </p>

          {!adminOnly ? (
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-[#fff2f4] p-1.5">
              <button
                type="button"
                onClick={() => setRole("staff")}
                className={`rounded-2xl px-4 py-3 text-sm font-black ${role === "staff" ? "bg-[#ff7f8f] text-white" : "text-[#874c5c]"}`}
              >
                Staff Login
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`rounded-2xl px-4 py-3 text-sm font-black ${role === "admin" ? "bg-[#5d2735] text-white" : "text-[#874c5c]"}`}
              >
                Admin Login
              </button>
            </div>
          ) : null}

          {role === "staff" ? (
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#b15d71]">Store ID</label>
                <input
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#f0ccd6] px-4 py-4 text-lg font-bold text-[#4e2030] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#b15d71]">Staff ID</label>
                <input
                  value={staffId}
                  onChange={(event) => setStaffId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#f0ccd6] px-4 py-4 text-lg font-bold text-[#4e2030] outline-none"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <label className="text-xs font-black uppercase tracking-[0.14em] text-[#b15d71]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              className="mt-2 w-full rounded-2xl border border-[#f0ccd6] px-4 py-4 text-lg font-bold text-[#4e2030] outline-none"
            />
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-[#f7c2ca] bg-[#fff2f3] px-4 py-3 text-sm font-bold text-[#b23d53]">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-[linear-gradient(135deg,#ff8f70,#ff6b7d)] px-4 py-4 text-lg font-black text-white disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <div className="mt-5 rounded-2xl bg-[#fff7ef] px-4 py-4 text-sm font-semibold text-[#7e5c48]">
            Sample credentials
            <br />
            {adminOnly ? "Admin password: `ADMIN_PANEL_TOKEN`" : "Staff: `storeId=pohang_01`, `staffId=staff_02`"}
            {!adminOnly ? (
              <>
                <br />
                Admin password: `ADMIN_PANEL_TOKEN`
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
