"use client";

import { useEffect, useState } from "react";
import { type EntryContactType } from "../lib/entry";

export type LoginPayload = {
  nickname: string;
  pin: string;
  loginMode: "existing" | "new";
  contactType: EntryContactType;
  contactValue: string;
};

function buildInternalContactValue(nickname: string) {
  const slug = Array.from(nickname.trim().toLowerCase())
    .map((char) => char.codePointAt(0)?.toString(36) ?? "")
    .filter(Boolean)
    .join(".")
    .slice(0, 48)
    .replace(/\.$/, "");

  return `${slug || "player"}@froyo.local`;
}

export default function LoginScreen({
  initialNickname = "",
  onLogin,
  submitError = null,
  loading = false,
  mode = "login",
  currentAccount,
  onCancel,
}: {
  initialNickname?: string;
  initialContactType?: EntryContactType;
  initialContactValue?: string;
  onLogin: (payload: LoginPayload) => void;
  submitError?: string | null;
  loading?: boolean;
  mode?: "login" | "switch";
  currentAccount?: string;
  onCancel?: () => void;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [pin, setPin] = useState("");
  const [loginMode, setLoginMode] = useState<"existing" | "new">("existing");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    setNickname(initialNickname);
  }, [initialNickname]);

  const buildPayload = (): LoginPayload | null => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      setNicknameError("Nickname must be 2-12 characters.");
      return null;
    }
    if (!/^\d{4}$/.test(pin)) {
      setPinError("Enter a 4-digit number.");
      return null;
    }

    setNicknameError(null);
    setPinError(null);
    return {
      nickname: trimmed,
      pin,
      loginMode,
      contactType: "email",
      contactValue: buildInternalContactValue(trimmed),
    };
  };

  const submit = () => {
    const payload = buildPayload();
    if (!payload) return;
    onLogin(payload);
  };

  return (
    <main className="flex min-h-[70vh] items-center p-4 sm:p-5">
      <div className="mx-auto w-full max-w-md">
        <section className="w-full overflow-hidden rounded-[1.8rem] border border-[var(--yl-card-border)] bg-white/95 shadow-[0_20px_48px_rgba(150,9,83,0.2)] backdrop-blur-sm">
          <div className="border-b border-[var(--yl-card-border)] bg-[linear-gradient(135deg,#fff7fb,#ffe8f4)] px-5 py-5 sm:px-6">
            <img
              src="/yogurtland-logo.png"
              alt="Yogurtland"
              className="h-8 w-auto"
              draggable={false}
            />
            <h1 className="mt-1 text-[2rem] font-black leading-[1.05] text-[var(--yl-ink-strong)]">Froyo Catcher</h1>
            <p className="mt-2 text-sm font-semibold text-[var(--yl-ink-muted)]">
              {mode === "switch"
                ? "Choose whether to use an existing ID or create a new one."
                : "Use your nickname and 4-digit number to continue."}
            </p>
            {mode === "switch" && currentAccount ? (
              <p className="mt-2 text-sm font-black text-[var(--yl-primary)]">
                Current account: {currentAccount}
              </p>
            ) : null}
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--yl-card-border)] bg-[#fff9fc] p-1.5">
              {([
                ["existing", "Existing ID"],
                ["new", "New ID"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setLoginMode(value);
                    setNicknameError(null);
                    setPinError(null);
                  }}
                  className={`rounded-xl px-3 py-2.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)] ${
                    loginMode === value
                      ? "bg-[var(--yl-primary)] text-white shadow-[0_8px_18px_rgba(150,9,83,0.22)]"
                      : "bg-transparent text-[var(--yl-ink-muted)] hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--yl-card-border)] bg-[#fff9fc] p-4">
              <label htmlFor="login-nickname" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">
                Nickname
              </label>
              <input
                id="login-nickname"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (nicknameError) setNicknameError(null);
                }}
                maxLength={12}
                placeholder="2-12 characters"
                className="mt-2 w-full rounded-xl border border-[var(--yl-card-border)] bg-white px-3 py-2.5 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
              />
              <p className="mt-2 text-[11px] font-semibold text-[var(--yl-ink-muted)]">
                This nickname will appear on the leaderboard.
              </p>
              {nicknameError ? <p className="mt-2 text-sm font-bold text-[var(--yl-primary-soft)]">{nicknameError}</p> : null}
            </div>

            <div className="rounded-2xl border border-[var(--yl-card-border)] bg-[#fff9fc] p-4">
              <label htmlFor="login-pin" className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">
                4-digit number
              </label>
              <input
                id="login-pin"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  if (pinError) setPinError(null);
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="1234"
                className="mt-2 w-full rounded-xl border border-[var(--yl-card-border)] bg-white px-3 py-2.5 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
              />
              <p className="mt-2 text-[11px] font-semibold text-[var(--yl-ink-muted)]">
                {loginMode === "existing"
                  ? "Enter the number you used when you created this ID."
                  : "Create a number you can remember for this nickname."}
              </p>
              {pinError ? <p className="mt-2 text-sm font-bold text-[var(--yl-primary-soft)]">{pinError}</p> : null}
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,var(--yl-primary),var(--yl-primary-soft))] px-4 py-3 text-base font-black uppercase tracking-[0.12em] text-white shadow-[0_14px_24px_rgba(150,9,83,0.35)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)] disabled:opacity-60"
            >
              {loading ? "Checking..." : "Login"}
            </button>
            {submitError ? (
              <p className="rounded-lg border border-[#f3bad5] bg-[#fff2f8] px-2.5 py-1.5 text-sm font-bold text-[var(--yl-primary-soft)]">
                {submitError}
              </p>
            ) : null}
            {mode === "switch" && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="w-full rounded-2xl border border-[var(--yl-card-border)] bg-white px-4 py-3 text-base font-black uppercase tracking-[0.08em] text-[var(--yl-ink-muted)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)]"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
