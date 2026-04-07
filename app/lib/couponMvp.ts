import { randomBytes } from "crypto";

export const COUPON_SCORE_THRESHOLD = 10;
export const DEFAULT_DISCOUNT_AMOUNT = 3000;
export const DEFAULT_EXPIRY_DAYS = 14;
export const COUPON_NAME = "3,000 KRW Off Coupon";
export const COUPON_REWARD_TYPE = "score_discount";
export const COUPON_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const COUPON_CODE_LENGTH = 8;

export type CouponStatus = "unused" | "used" | "expired";
export type CouponLookupStatus = CouponStatus | "invalid";
export type PortalRole = "admin" | "staff";

export type CouponRow = {
  id: number;
  code: string;
  user_id: string | null;
  coupon_name: string;
  reward_type: string;
  discount_amount: number;
  status: CouponStatus;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_store_id: string | null;
  redeemed_staff_id: string | null;
  order_number: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeCouponCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export function createCouponCode() {
  const bytes = randomBytes(COUPON_CODE_LENGTH);
  let code = "YG";

  for (let index = 0; index < COUPON_CODE_LENGTH - 2; index += 1) {
    code += COUPON_CODE_ALPHABET[bytes[index] % COUPON_CODE_ALPHABET.length];
  }

  return code;
}

export function getCouponExpiryIso(days = DEFAULT_EXPIRY_DAYS, now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);
  expiresAt.setHours(23, 59, 59, 999);
  return expiresAt.toISOString();
}

export function getCouponStatus(row: {
  status?: string | null;
  expires_at?: string | null;
  redeemed_at?: string | null;
}): CouponLookupStatus {
  const status = String(row.status || "");
  const redeemedAt = row.redeemed_at ? new Date(row.redeemed_at).getTime() : NaN;
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN;

  if (status === "used" || Number.isFinite(redeemedAt)) return "used";
  if (status === "expired") return "expired";
  if (!Number.isFinite(expiresAt)) return "invalid";
  if (expiresAt < Date.now()) return "expired";
  return "unused";
}

export function getCouponReason(status: CouponLookupStatus) {
  if (status === "unused") return "This coupon is valid.";
  if (status === "used") return "This coupon has already been used.";
  if (status === "expired") return "This coupon has expired.";
  return "This coupon does not exist.";
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function buildRedeemUrl(baseUrl: string, code: string) {
  return `${baseUrl.replace(/\/$/, "")}/r/${encodeURIComponent(code)}`;
}

export function buildChartSeries(days: number, rows: string[]) {
  const labels: string[] = [];
  const points = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - offset);
    const key = current.toISOString().slice(0, 10);
    labels.push(key);
    points.set(key, 0);
  }

  for (const value of rows) {
    const key = value.slice(0, 10);
    if (points.has(key)) {
      points.set(key, (points.get(key) || 0) + 1);
    }
  }

  return labels.map((label) => ({
    date: label,
    count: points.get(label) || 0,
  }));
}
