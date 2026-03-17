"use client";

import { useState } from "react";

type PortalRole = "staff" | "admin";

export default function PortalLoginClient({ nextPath }: { nextPath: string }) {
  const [role, setRole] = useState<PortalRole>("staff");
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
        setError(json.error || "로그인에 실패했습니다.");
        return;
      }

      const fallback = json.session?.role === "admin" ? "/admin" : "/redeem";
      window.location.href = nextPath || fallback;
    } catch {
      setError("로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fffaf2_0%,#ffe8ef_45%,#ffd8d8_100%)] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="rounded-[2rem] border border-[#f4c7d7] bg-white/95 p-6 shadow-[0_24px_60px_rgba(167,71,95,0.18)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#c05a71]">Yogurtland Portal</p>
          <h1 className="mt-2 text-4xl font-black leading-none text-[#5d2735]">쿠폰 운영 로그인</h1>
          <p className="mt-3 text-sm font-semibold text-[#855161]">
            직원은 리딤 화면, 관리자는 통계 대시보드로 이동합니다.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-[#fff2f4] p-1.5">
            <button
              type="button"
              onClick={() => setRole("staff")}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${role === "staff" ? "bg-[#ff7f8f] text-white" : "text-[#874c5c]"}`}
            >
              직원 로그인
            </button>
            <button
              type="button"
              onClick={() => setRole("admin")}
              className={`rounded-2xl px-4 py-3 text-sm font-black ${role === "admin" ? "bg-[#5d2735] text-white" : "text-[#874c5c]"}`}
            >
              관리자 로그인
            </button>
          </div>

          {role === "staff" ? (
            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#b15d71]">매장 ID</label>
                <input
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#f0ccd6] px-4 py-4 text-lg font-bold text-[#4e2030] outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#b15d71]">직원 ID</label>
                <input
                  value={staffId}
                  onChange={(event) => setStaffId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#f0ccd6] px-4 py-4 text-lg font-bold text-[#4e2030] outline-none"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <label className="text-xs font-black uppercase tracking-[0.14em] text-[#b15d71]">비밀번호</label>
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
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <div className="mt-5 rounded-2xl bg-[#fff7ef] px-4 py-4 text-sm font-semibold text-[#7e5c48]">
            테스트용 샘플
            <br />
            직원: `storeId=pohang_01`, `staffId=staff_02`
            <br />
            관리자 비밀번호: `ADMIN_PANEL_TOKEN`
          </div>
        </div>
      </div>
    </main>
  );
}
