import { type WalletCoupon } from "./coupons";

const WALLET_STORAGE_PREFIX = "walletCouponsLocal";

function safePart(value: string) {
  return encodeURIComponent(value.trim().toLowerCase()).slice(0, 80);
}

export function getWalletStorageKey(input?: { nickname?: string | null; contactValue?: string | null }) {
  if (typeof window === "undefined") return WALLET_STORAGE_PREFIX;

  const nickname = String(input?.nickname ?? window.localStorage.getItem("nickname") ?? "").trim();
  const contactValue = String(input?.contactValue ?? window.localStorage.getItem("entryContactValue") ?? "").trim();

  if (!nickname) return WALLET_STORAGE_PREFIX;
  return `${WALLET_STORAGE_PREFIX}:${safePart(nickname)}:${safePart(contactValue || "local")}`;
}

export function readLocalWalletCoupons(input?: { nickname?: string | null; contactValue?: string | null }): WalletCoupon[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(getWalletStorageKey(input));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WalletCoupon[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalWalletCoupons(
  coupons: WalletCoupon[],
  input?: { nickname?: string | null; contactValue?: string | null }
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getWalletStorageKey(input), JSON.stringify(coupons));
  } catch {
    // Ignore storage write failures so the UI can continue with server data.
  }
}

export function removeLegacyWalletCoupons() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WALLET_STORAGE_PREFIX);
}
