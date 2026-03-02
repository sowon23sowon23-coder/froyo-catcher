"use client";

import { useEffect, useState } from "react";
import { getContactValidationError, normalizeEmail, normalizeUsPhone, type EntryContactType } from "../lib/entry";

const EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "naver.com",
  "daum.net",
] as const;

const CUSTOM_EMAIL_DOMAIN = "__custom__";

export type LoginPayload = {
  nickname: string;
  contactType: EntryContactType;
  contactValue: string;
};

type RequestContactChangePayload = {
  nickname: string;
  oldContactType: EntryContactType;
  oldContactValue: string;
  newContactType: EntryContactType;
  newContactValue: string;
};

type RequestContactChangeResult = {
  requestId: string;
  debugOldCode?: string;
  debugNewCode?: string;
};

type ConfirmContactChangePayload = {
  requestId: string;
  oldCode: string;
  newCode: string;
};

type ConfirmContactChangeResult = {
  newContactType: EntryContactType;
  newContactValue: string;
};

export default function LoginScreen({
  initialNickname = "",
  initialContactType = "phone",
  initialContactValue = "",
  onLogin,
  onRequestContactChange,
  onConfirmContactChange,
  onDeleteNickname,
  loading = false,
}: {
  initialNickname?: string;
  initialContactType?: EntryContactType;
  initialContactValue?: string;
  onLogin: (payload: LoginPayload) => void;
  onRequestContactChange: (payload: RequestContactChangePayload) => Promise<RequestContactChangeResult>;
  onConfirmContactChange: (payload: ConfirmContactChangePayload) => Promise<ConfirmContactChangeResult>;
  onDeleteNickname?: () => void;
  loading?: boolean;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [contactType, setContactType] = useState<EntryContactType>(initialContactType);
  const [contactValue, setContactValue] = useState(initialContactValue);
  const [emailDomainSelect, setEmailDomainSelect] = useState<string>(EMAIL_DOMAINS[0]);
  const [customEmailDomain, setCustomEmailDomain] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeOldType, setChangeOldType] = useState<EntryContactType>("phone");
  const [changeOldValue, setChangeOldValue] = useState("");
  const [changeNewType, setChangeNewType] = useState<EntryContactType>("phone");
  const [changeNewValue, setChangeNewValue] = useState("");
  const [changeRequestId, setChangeRequestId] = useState<string | null>(null);
  const [changeOldCode, setChangeOldCode] = useState("");
  const [changeNewCode, setChangeNewCode] = useState("");
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [debugOldCode, setDebugOldCode] = useState<string | null>(null);
  const [debugNewCode, setDebugNewCode] = useState<string | null>(null);

  useEffect(() => {
    setNickname(initialNickname);
  }, [initialNickname]);

  useEffect(() => {
    setContactType(initialContactType);
  }, [initialContactType]);

  useEffect(() => {
    setContactValue(initialContactValue);
    if (initialContactType !== "email") return;

    const [localPartRaw = "", domainRaw = ""] = initialContactValue.split("@");
    const localPart = localPartRaw.trim();
    const domain = domainRaw.trim().toLowerCase();

    if (localPart) setContactValue(localPart);
    if (domain && EMAIL_DOMAINS.includes(domain as (typeof EMAIL_DOMAINS)[number])) {
      setEmailDomainSelect(domain);
      setCustomEmailDomain("");
      return;
    }
    if (domain) {
      setEmailDomainSelect(CUSTOM_EMAIL_DOMAIN);
      setCustomEmailDomain(domain);
    }
  }, [initialContactValue]);

  const handleContactBlur = () => {
    const err = getContactValidationError(contactType, getRawContact());
    setContactError(err);
  };

  const getRawContact = () => {
    if (contactType === "phone") return contactValue.trim();
    const local = contactValue.trim();
    const domain =
      emailDomainSelect === CUSTOM_EMAIL_DOMAIN ? customEmailDomain.trim() : emailDomainSelect.trim();
    return `${local}@${domain}`;
  };

  const submit = () => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      setNicknameError("Nickname must be 2-12 characters.");
      return;
    }

    const rawContact = getRawContact();
    const contactValidationError = getContactValidationError(contactType, rawContact);
    if (contactValidationError) {
      setContactError(contactValidationError);
      return;
    }

    const normalizedContact =
      contactType === "phone" ? normalizeUsPhone(rawContact) : normalizeEmail(rawContact);
    if (!normalizedContact) {
      setContactError(
        contactType === "phone"
          ? "Enter a valid US phone number."
          : "Enter a valid email address.",
      );
      return;
    }

    setNicknameError(null);
    setContactError(null);
    onLogin({
      nickname: trimmed,
      contactType,
      contactValue: normalizedContact,
    });
  };

  const clearNickname = () => {
    setNickname("");
    setNicknameError(null);
    onDeleteNickname?.();
  };

  const requestContactChange = async () => {
    const nicknameTrimmed = nickname.trim();
    if (nicknameTrimmed.length < 2 || nicknameTrimmed.length > 12) {
      setChangeNotice("Enter your nickname first.");
      return;
    }
    const oldNormalized = changeOldType === "phone" ? normalizeUsPhone(changeOldValue) : normalizeEmail(changeOldValue);
    const newNormalized = changeNewType === "phone" ? normalizeUsPhone(changeNewValue) : normalizeEmail(changeNewValue);
    if (!oldNormalized || !newNormalized) {
      setChangeNotice("Enter valid current/new contact values.");
      return;
    }

    setChangeLoading(true);
    setChangeNotice(null);
    try {
      const result = await onRequestContactChange({
        nickname: nicknameTrimmed,
        oldContactType: changeOldType,
        oldContactValue: oldNormalized,
        newContactType: changeNewType,
        newContactValue: newNormalized,
      });
      setChangeRequestId(result.requestId);
      setDebugOldCode(result.debugOldCode ?? null);
      setDebugNewCode(result.debugNewCode ?? null);
      setChangeNotice("Verification codes sent. Enter both codes to confirm.");
    } catch (err) {
      setChangeNotice((err as Error).message || "Failed to request contact change.");
    } finally {
      setChangeLoading(false);
    }
  };

  const confirmContactChange = async () => {
    if (!changeRequestId) {
      setChangeNotice("Request a contact change first.");
      return;
    }
    if (!/^\d{6}$/.test(changeOldCode) || !/^\d{6}$/.test(changeNewCode)) {
      setChangeNotice("Enter both 6-digit verification codes.");
      return;
    }

    setChangeLoading(true);
    setChangeNotice(null);
    try {
      const result = await onConfirmContactChange({
        requestId: changeRequestId,
        oldCode: changeOldCode,
        newCode: changeNewCode,
      });

      setContactType(result.newContactType);
      if (result.newContactType === "email") {
        const [localPartRaw = "", domainRaw = ""] = result.newContactValue.split("@");
        const localPart = localPartRaw.trim();
        const domain = domainRaw.trim().toLowerCase();
        setContactValue(localPart);
        if (domain && EMAIL_DOMAINS.includes(domain as (typeof EMAIL_DOMAINS)[number])) {
          setEmailDomainSelect(domain);
          setCustomEmailDomain("");
        } else {
          setEmailDomainSelect(CUSTOM_EMAIL_DOMAIN);
          setCustomEmailDomain(domain);
        }
      } else {
        setContactValue(result.newContactValue);
      }

      setChangeRequestId(null);
      setChangeOldCode("");
      setChangeNewCode("");
      setDebugOldCode(null);
      setDebugNewCode(null);
      setChangeNotice("Contact updated successfully. You can now log in.");
    } catch (err) {
      setChangeNotice((err as Error).message || "Failed to confirm contact change.");
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <main className="flex min-h-[70vh] items-center p-5">
      <div className="mx-auto w-full max-w-sm">
        <section className="w-full rounded-3xl border border-[var(--yl-card-border)] bg-white/92 p-6 shadow-[0_16px_40px_rgba(150,9,83,0.16)] backdrop-blur-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--yl-primary)]">Yogurtland</p>
          <h1 className="mt-1 text-3xl font-black leading-[1.08] text-[var(--yl-ink-strong)]">Ice Cream Catcher</h1>
          <p className="mt-2 text-base font-semibold text-[var(--yl-ink-muted)]">Start by logging in with your nickname.</p>

          <label htmlFor="login-nickname" className="mt-5 block text-sm font-black uppercase tracking-[0.1em] text-[var(--yl-primary)]">
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
            className="mt-1 w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
          />
          {(nickname.trim().length > 0 || initialNickname.trim().length > 0) && (
            <button
              type="button"
              onClick={clearNickname}
              className="mt-2 text-sm font-black text-[var(--yl-primary-soft)] underline underline-offset-4"
            >
              Delete saved nickname
            </button>
          )}
          {nicknameError ? <p className="mt-2 text-sm font-bold text-[var(--yl-primary-soft)]">{nicknameError}</p> : null}
          <p className="mt-2 text-xs font-semibold text-[var(--yl-ink-muted)]">
            Nickname is linked 1:1 with contact. The same nickname cannot be used with a different email or phone.
          </p>

          <p className="mt-4 text-sm font-black uppercase tracking-[0.1em] text-[var(--yl-primary)]">
            Contact (Coupon)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setContactType("phone");
                setContactValue("");
                setEmailDomainSelect(EMAIL_DOMAINS[0]);
                setCustomEmailDomain("");
                if (contactError) setContactError(null);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-black ${
                contactType === "phone"
                  ? "border-[var(--yl-primary)] bg-[var(--yl-primary)] text-white"
                  : "border-[var(--yl-card-border)] bg-white text-[var(--yl-ink-muted)]"
              }`}
            >
              Phone
            </button>
            <button
              type="button"
              onClick={() => {
                setContactType("email");
                setContactValue("");
                setEmailDomainSelect(EMAIL_DOMAINS[0]);
                setCustomEmailDomain("");
                if (contactError) setContactError(null);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-black ${
                contactType === "email"
                  ? "border-[var(--yl-primary)] bg-[var(--yl-primary)] text-white"
                  : "border-[var(--yl-card-border)] bg-white text-[var(--yl-ink-muted)]"
              }`}
            >
              Email
            </button>
          </div>
          {contactType === "phone" ? (
            <input
              value={contactValue}
              onChange={(e) => {
                setContactValue(e.target.value);
                if (contactError) setContactError(null);
              }}
              onBlur={handleContactBlur}
              type="tel"
              inputMode="tel"
              maxLength={24}
              placeholder="e.g. 213-555-1234"
              className="mt-2 w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
            />
          ) : (
            <div className="mt-2 grid gap-2">
              <div className="grid grid-cols-[1fr_auto_150px] items-center gap-2">
                <input
                  value={contactValue}
                  onChange={(e) => {
                    setContactValue(e.target.value.replace("@", ""));
                    if (contactError) setContactError(null);
                  }}
                  onBlur={handleContactBlur}
                  type="text"
                  inputMode="email"
                  maxLength={64}
                  placeholder="username"
                  className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                />
                <span className="text-base font-black text-[var(--yl-ink-muted)]">@</span>
                <select
                  value={emailDomainSelect}
                  onChange={(e) => {
                    setEmailDomainSelect(e.target.value);
                    if (contactError) setContactError(null);
                  }}
                  onBlur={handleContactBlur}
                  className="rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2 text-sm font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                >
                  {EMAIL_DOMAINS.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                  <option value={CUSTOM_EMAIL_DOMAIN}>Custom domain</option>
                </select>
              </div>
              {emailDomainSelect === CUSTOM_EMAIL_DOMAIN && (
                <input
                  value={customEmailDomain}
                  onChange={(e) => {
                    setCustomEmailDomain(e.target.value.toLowerCase().replace(/^@+/, ""));
                    if (contactError) setContactError(null);
                  }}
                  onBlur={handleContactBlur}
                  type="text"
                  inputMode="email"
                  maxLength={120}
                  placeholder="example.com"
                  className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                />
              )}
            </div>
          )}
          {contactError ? <p className="mt-1 text-sm font-bold text-[var(--yl-primary-soft)]">{contactError}</p> : null}
          <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">
            Used only for digital coupon notification.
          </p>

          <div className="mt-4 rounded-xl border border-[var(--yl-card-border)] bg-white/70 p-3">
            <button
              type="button"
              onClick={() => {
                setChangeOpen((v) => !v);
                setChangeNotice(null);
              }}
              className="text-sm font-black text-[var(--yl-primary)] underline underline-offset-4"
            >
              {changeOpen ? "Hide Contact Change" : "Need to change email/phone?"}
            </button>

            {changeOpen && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-[var(--yl-ink-muted)]">
                  Verify current contact and new contact with 6-digit codes.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={changeOldType}
                    onChange={(e) => setChangeOldType(e.target.value as EntryContactType)}
                    className="rounded-lg border border-[var(--yl-card-border)] bg-[#fff9fc] px-2 py-2 text-sm font-semibold text-[var(--yl-ink-strong)]"
                  >
                    <option value="phone">Current Phone</option>
                    <option value="email">Current Email</option>
                  </select>
                  <input
                    value={changeOldValue}
                    onChange={(e) => setChangeOldValue(e.target.value)}
                    placeholder={changeOldType === "phone" ? "Current phone" : "Current email"}
                    className="rounded-lg border border-[var(--yl-card-border)] bg-[#fff9fc] px-2 py-2 text-sm font-semibold text-[var(--yl-ink-strong)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={changeNewType}
                    onChange={(e) => setChangeNewType(e.target.value as EntryContactType)}
                    className="rounded-lg border border-[var(--yl-card-border)] bg-[#fff9fc] px-2 py-2 text-sm font-semibold text-[var(--yl-ink-strong)]"
                  >
                    <option value="phone">New Phone</option>
                    <option value="email">New Email</option>
                  </select>
                  <input
                    value={changeNewValue}
                    onChange={(e) => setChangeNewValue(e.target.value)}
                    placeholder={changeNewType === "phone" ? "New phone" : "New email"}
                    className="rounded-lg border border-[var(--yl-card-border)] bg-[#fff9fc] px-2 py-2 text-sm font-semibold text-[var(--yl-ink-strong)]"
                  />
                </div>

                <button
                  type="button"
                  onClick={requestContactChange}
                  disabled={changeLoading}
                  className="w-full rounded-lg border border-[var(--yl-card-border)] bg-white px-3 py-2 text-sm font-black text-[var(--yl-primary)] disabled:opacity-60"
                >
                  {changeLoading ? "Requesting..." : "Send Verification Codes"}
                </button>

                {changeRequestId && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={changeOldCode}
                        onChange={(e) => setChangeOldCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Current contact code"
                        className="rounded-lg border border-[var(--yl-card-border)] bg-[#fff9fc] px-2 py-2 text-sm font-semibold text-[var(--yl-ink-strong)]"
                      />
                      <input
                        value={changeNewCode}
                        onChange={(e) => setChangeNewCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="New contact code"
                        className="rounded-lg border border-[var(--yl-card-border)] bg-[#fff9fc] px-2 py-2 text-sm font-semibold text-[var(--yl-ink-strong)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={confirmContactChange}
                      disabled={changeLoading}
                      className="w-full rounded-lg bg-[var(--yl-primary)] px-3 py-2 text-sm font-black text-white disabled:opacity-60"
                    >
                      {changeLoading ? "Confirming..." : "Confirm Contact Change"}
                    </button>
                    {(debugOldCode || debugNewCode) && (
                      <p className="text-xs font-semibold text-[var(--yl-ink-muted)]">
                        Debug codes (non-production): old {debugOldCode ?? "-"}, new {debugNewCode ?? "-"}
                      </p>
                    )}
                  </div>
                )}

                {changeNotice ? (
                  <p className="text-xs font-bold text-[var(--yl-primary-soft)]">{changeNotice}</p>
                ) : null}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-[linear-gradient(135deg,var(--yl-primary),var(--yl-primary-soft))] px-4 py-3 text-base font-black uppercase tracking-[0.1em] text-white shadow-[0_14px_24px_rgba(150,9,83,0.35)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)] disabled:opacity-60"
          >
            {loading ? "Checking..." : "Login"}
          </button>
        </section>
      </div>
    </main>
  );
}


