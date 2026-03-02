"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { normalizeEmail, normalizeUsPhone, type EntryContactType } from "../lib/entry";
import StoreCombobox from "./StoreCombobox";

export type LoginPayload = {
  nickname: string;
  contactType: EntryContactType;
  contactValue: string;
};

export default function LoginScreen({
  initialNickname = "",
  initialContactType = "phone",
  initialContactValue = "",
  stores,
  selectedStore,
  onStoreChange,
  onLogin,
  onDeleteNickname,
  loading = false,
}: {
  initialNickname?: string;
  initialContactType?: EntryContactType;
  initialContactValue?: string;
  stores: string[];
  selectedStore: string;
  onStoreChange: (store: string) => void;
  onLogin: (payload: LoginPayload) => void;
  onDeleteNickname?: () => void;
  loading?: boolean;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [contactType, setContactType] = useState<EntryContactType>(initialContactType);
  const [contactValue, setContactValue] = useState(initialContactValue);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [lockedStore, setLockedStore] = useState<string | null>(null);
  const [checkingStore, setCheckingStore] = useState(false);
  const lastCheckedNick = useRef<string>("");

  useEffect(() => {
    setNickname(initialNickname);
  }, [initialNickname]);

  useEffect(() => {
    setContactType(initialContactType);
  }, [initialContactType]);

  useEffect(() => {
    setContactValue(initialContactValue);
  }, [initialContactValue]);

  // When initialNickname is pre-filled (returning user), look up their store immediately.
  useEffect(() => {
    if (!initialNickname || initialNickname.trim().length < 2) return;
    void lookupStore(initialNickname.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNickname]);

  const lookupStore = async (trimmed: string) => {
    if (lastCheckedNick.current === trimmed) return;
    lastCheckedNick.current = trimmed;

    setCheckingStore(true);
    try {
      const key = trimmed.toLowerCase();
      const { data } = await supabase
        .from("leaderboard_best_v2")
        .select("store")
        .eq("nickname_key", key)
        .not("store", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);

      const dbStore = (data?.[0] as { store?: string } | undefined)?.store?.trim();
      if (dbStore && dbStore !== "__ALL__" && stores.includes(dbStore)) {
        setLockedStore(dbStore);
        onStoreChange(dbStore);
      } else {
        setLockedStore(null);
      }
    } catch {
      setLockedStore(null);
    } finally {
      setCheckingStore(false);
    }
  };

  const handleNicknameBlur = () => {
    const trimmed = nickname.trim();
    if (trimmed.length >= 2) {
      void lookupStore(trimmed);
    } else {
      setLockedStore(null);
      lastCheckedNick.current = "";
    }
  };

  const submit = () => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 12) {
      setNicknameError("Nickname must be 2-12 characters.");
      return;
    }

    const rawContact = contactValue.trim();
    if (!rawContact) {
      setContactError(contactType === "phone" ? "Phone number is required." : "Email is required.");
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

    if (!selectedStore.trim()) {
      setStoreError("Please select a store.");
      return;
    }
    setNicknameError(null);
    setContactError(null);
    setStoreError(null);
    onLogin({
      nickname: trimmed,
      contactType,
      contactValue: normalizedContact,
    });
  };

  const clearNickname = () => {
    setNickname("");
    setNicknameError(null);
    setStoreError(null);
    setLockedStore(null);
    lastCheckedNick.current = "";
    onDeleteNickname?.();
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
              // Reset lock when user types a new nickname
              setLockedStore(null);
              lastCheckedNick.current = "";
            }}
            onBlur={handleNicknameBlur}
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

          <p className="mt-4 text-sm font-black uppercase tracking-[0.1em] text-[var(--yl-primary)]">
            Contact (Coupon)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setContactType("phone");
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
          <input
            value={contactValue}
            onChange={(e) => {
              setContactValue(e.target.value);
              if (contactError) setContactError(null);
            }}
            maxLength={contactType === "phone" ? 24 : 160}
            placeholder={contactType === "phone" ? "e.g. 213-555-1234" : "e.g. user@example.com"}
            className="mt-2 w-full rounded-xl border border-[var(--yl-card-border)] bg-[#fff9fc] px-3 py-2 text-base font-semibold text-[var(--yl-ink-strong)] outline-none focus:border-[var(--yl-primary)]"
          />
          {contactError ? <p className="mt-1 text-sm font-bold text-[var(--yl-primary-soft)]">{contactError}</p> : null}
          <p className="mt-1 text-xs font-semibold text-[var(--yl-ink-muted)]">
            Used only for digital coupon notification.
          </p>

          <label htmlFor="login-store" className="mt-4 block text-sm font-black uppercase tracking-[0.1em] text-[var(--yl-primary)]">
            Store
            {checkingStore && (
              <span className="ml-2 text-xs font-semibold normal-case text-[var(--yl-ink-muted)]">Checking...</span>
            )}
            {lockedStore && (
              <span className="ml-2 text-xs font-semibold normal-case text-[var(--yl-primary-soft)]">Locked</span>
            )}
          </label>
          <StoreCombobox
            stores={stores}
            value={selectedStore}
            onChange={(store) => {
              if (lockedStore) return; // prevent change when locked
              onStoreChange(store);
              if (store) setStoreError(null);
            }}
            disabled={!!lockedStore}
            placeholder="Search store..."
            wrapperClassName="mt-1"
            inputClassName={`w-full rounded-xl border px-3 py-2 text-base font-semibold text-[var(--yl-ink-strong)] outline-none transition ${
              lockedStore
                ? "border-[var(--yl-card-border)] bg-[#fff0f7] text-[var(--yl-ink-muted)] cursor-not-allowed"
                : "border-[var(--yl-card-border)] bg-[#fff9fc] focus:border-[var(--yl-primary)]"
            }`}
          />
          {lockedStore ? (
            <p className="mt-1 text-sm font-semibold text-[var(--yl-ink-muted)]">
              This nickname is already registered to a store. To change stores, delete the nickname and register
              again.
            </p>
          ) : storeError ? (
            <p className="mt-1 text-sm font-bold text-[var(--yl-primary-soft)]">{storeError}</p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={loading || checkingStore}
            className="mt-4 w-full rounded-xl bg-[linear-gradient(135deg,var(--yl-primary),var(--yl-primary-soft))] px-4 py-3 text-base font-black uppercase tracking-[0.1em] text-white shadow-[0_14px_24px_rgba(150,9,83,0.35)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yl-focus-ring)] disabled:opacity-60"
          >
            {loading ? "Checking..." : "Login"}
          </button>
        </section>
      </div>
    </main>
  );
}


