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

function formatUsPhoneInput(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function splitUsPhoneParts(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  return {
    area: digits.slice(0, 3),
    prefix: digits.slice(3, 6),
    line: digits.slice(6, 10),
  };
}

export type LoginPayload = {
  nickname: string;
  contactType: EntryContactType;
  contactValue: string;
  rememberMe: boolean;
};

export default function LoginScreen({
  initialNickname = "",
  initialContactType = "phone",
  initialContactValue = "",
  onLogin,
  onChangeContact,
  submitError = null,
  loading = false,
  initialRememberMe = true,
}: {
  initialNickname?: string;
  initialContactType?: EntryContactType;
  initialContactValue?: string;
  onLogin: (payload: LoginPayload) => void;
  onChangeContact?: (payload: LoginPayload) => Promise<void>;
  submitError?: string | null;
  loading?: boolean;
  initialRememberMe?: boolean;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [contactType, setContactType] = useState<EntryContactType>(initialContactType);
  const [contactValue, setContactValue] = useState(initialContactValue);
  const [emailDomainSelect, setEmailDomainSelect] = useState<string>(EMAIL_DOMAINS[0]);
  const [customEmailDomain, setCustomEmailDomain] = useState("");
  const [phoneArea, setPhoneArea] = useState("");
  const [phonePrefix, setPhonePrefix] = useState("");
  const [phoneLine, setPhoneLine] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(initialRememberMe);

  useEffect(() => {
    setNickname(initialNickname);
  }, [initialNickname]);

  useEffect(() => {
    setContactType(initialContactType);
  }, [initialContactType]);

  useEffect(() => {
    setRememberMe(initialRememberMe);
  }, [initialRememberMe]);

  useEffect(() => {
    if (initialContactType === "phone") {
      const parts = splitUsPhoneParts(initialContactValue);
      setPhoneArea(parts.area);
      setPhonePrefix(parts.prefix);
      setPhoneLine(parts.line);
      setContactValue(formatUsPhoneInput(initialContactValue));
      return;
    }

    setContactValue(initialContactValue);

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
    if (contactType === "phone") {
      return `${phoneArea}-${phonePrefix}-${phoneLine}`.trim();
    }
    const local = contactValue.trim();
    const domain =
      emailDomainSelect === CUSTOM_EMAIL_DOMAIN ? customEmailDomain.trim() : emailDomainSelect.trim();
    return `${local}@${domain}`;
  };

  const buildPayload = (): LoginPayload | null => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      setNicknameError("Nickname must be 2-12 characters.");
      return null;
    }

    const rawContact = getRawContact();
    const contactValidationError = getContactValidationError(contactType, rawContact);
    if (contactValidationError) {
      setContactError(contactValidationError);
      return null;
    }

    const normalizedContact =
      contactType === "phone" ? normalizeUsPhone(rawContact) : normalizeEmail(rawContact);
    if (!normalizedContact) {
      setContactError(
        contactType === "phone"
          ? "Enter a valid US phone number."
          : "Enter a valid email address.",
      );
      return null;
    }

    setNicknameError(null);
    setContactError(null);
    setChangeNotice(null);
    return {
      nickname: trimmed,
      contactType,
      contactValue: normalizedContact,
      rememberMe,
    };
  };

  const submit = () => {
    const payload = buildPayload();
    if (!payload) return;
    onLogin(payload);
  };

  const changeContact = async () => {
    if (!onChangeContact) return;
    const payload = buildPayload();
    if (!payload) return;

    setChangeLoading(true);
    setChangeNotice(null);
    try {
      await onChangeContact(payload);
      setChangeNotice("Contact updated. You can continue with this new contact.");
    } catch (err) {
      setChangeNotice((err as Error).message || "Failed to change contact.");
    } finally {
      setChangeLoading(false);
    }
  };

  const onPhonePartChange = (part: "area" | "prefix" | "line", value: string) => {
    const digits = value.replace(/\D/g, "");
    if (part === "area") {
      setPhoneArea(digits.slice(0, 3));
      return;
    }
    if (part === "prefix") {
      setPhonePrefix(digits.slice(0, 3));
      return;
    }
    setPhoneLine(digits.slice(0, 4));
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
              Enter your nickname and coupon contact to continue.
            </p>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
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
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[var(--yl-ink-muted)]">
                  One nickname is bound to one contact.
                </p>
              </div>
              {nicknameError ? <p className="mt-2 text-sm font-bold text-[var(--yl-primary-soft)]">{nicknameError}</p> : null}
            </div>

            <div className="rounded-2xl border border-[var(--yl-card-border)] bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--yl-primary)]">Contact (Coupon)</p>
              <div className="mt-2 inline-flex rounded-xl bg-[#fdeaf4] p-1">
                <button
                  type="button"
                  onClick={() => {
                setContactType("phone");
                setContactValue("");
                setPhoneArea("");
                setPhonePrefix("");
                setPhoneLine("");
                setEmailDomainSelect(EMAIL_DOMAINS[0]);
                setCustomEmailDomain("");
                if (contactError) setContactError(null);
                  }}
                  className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.08em] ${
                    contactType === "phone"
                      ? "bg-[var(--yl-primary)] text-white shadow-[0_6px_14px_rgba(150,9,83,0.24)]"
                      : "text-[var(--yl-ink-muted)]"
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
                  className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.08em] ${
                    contactType === "email"
                      ? "bg-[var(--yl-primary)] text-white shadow-[0_6px_14px_rgba(150,9,83,0.24)]"
                      : "text-[var(--yl-ink-muted)]"
                  }`}
                >
                  Email
                </button>
              </div>

              {contactType === "phone" ? (
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr_auto_1.2fr] items-center gap-1.5 sm:gap-2">
                  <input
                    value={phoneArea}
                    onChange={(e) => {
                      onPhonePartChange("area", e.target.value);
                      if (contactError) setContactError(null);
                    }}
                    onBlur={handleContactBlur}
                    type="tel"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="213"
                    className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-1.5 py-2 text-center text-sm font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)] sm:px-2 sm:py-2.5 sm:text-base"
                  />
                  <span className="text-base font-black text-[var(--yl-ink-muted)]">-</span>
                  <input
                    value={phonePrefix}
                    onChange={(e) => {
                      onPhonePartChange("prefix", e.target.value);
                      if (contactError) setContactError(null);
                    }}
                    onBlur={handleContactBlur}
                    type="tel"
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="555"
                    className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-1.5 py-2 text-center text-sm font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)] sm:px-2 sm:py-2.5 sm:text-base"
                  />
                  <span className="text-base font-black text-[var(--yl-ink-muted)]">-</span>
                  <input
                    value={phoneLine}
                    onChange={(e) => {
                      onPhonePartChange("line", e.target.value);
                      if (contactError) setContactError(null);
                    }}
                    onBlur={handleContactBlur}
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="1234"
                    className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-1.5 py-2 text-center text-sm font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)] sm:px-2 sm:py-2.5 sm:text-base"
                  />
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  <div className="grid grid-cols-[1fr_auto_140px] items-center gap-2 sm:grid-cols-[1fr_auto_150px]">
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
                      className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2.5 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                    />
                    <span className="text-base font-black text-[var(--yl-ink-muted)]">@</span>
                    <select
                      value={emailDomainSelect}
                      onChange={(e) => {
                        setEmailDomainSelect(e.target.value);
                        if (contactError) setContactError(null);
                      }}
                      onBlur={handleContactBlur}
                      className="rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-2.5 py-2.5 text-sm font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                    >
                      {EMAIL_DOMAINS.map((domain) => (
                        <option key={domain} value={domain}>
                          {domain}
                        </option>
                      ))}
                      <option value={CUSTOM_EMAIL_DOMAIN}>Custom</option>
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
                      className="w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2.5 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
                    />
                  )}
                </div>
              )}

              {contactError ? (
                <p className="mt-2 rounded-lg border border-[#f3bad5] bg-[#fff2f8] px-2.5 py-1.5 text-sm font-bold text-[var(--yl-primary-soft)]">
                  {contactError}
                </p>
              ) : null}
              <p className="mt-2 text-[11px] font-semibold text-[var(--yl-ink-muted)]">
                Used only for digital coupon notification.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl border border-[var(--yl-card-border)] bg-[#fffbfd] p-3">
              <p className="text-[11px] font-semibold text-[var(--yl-ink-muted)]">
                Contact change works only when this device already has a valid login session.
              </p>
              {onChangeContact ? (
                <button
                  type="button"
                  onClick={changeContact}
                  disabled={loading || changeLoading}
                  className="inline-flex w-auto rounded-md border border-[var(--yl-card-border)] bg-white px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.02em] text-[var(--yl-primary)] disabled:opacity-60"
                >
                  {changeLoading ? "Updating..." : "Change Contact"}
                </button>
              ) : null}
              {changeNotice ? (
                <p className="rounded-lg border border-[#f3bad5] bg-[#fff2f8] px-2.5 py-1.5 text-sm font-bold text-[var(--yl-primary-soft)]">
                  {changeNotice}
                </p>
              ) : null}
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
            <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--yl-ink-muted)]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--yl-card-border)] text-[var(--yl-primary)] focus:ring-[var(--yl-focus-ring)]"
              />
              Keep me signed in on this device
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}


