import { z } from "zod";

import { getServerSupabase } from "./serverSupabase";
import {
  COUPON_NAME,
  COUPON_REWARD_TYPE,
  DEFAULT_DISCOUNT_AMOUNT,
  getCouponReason,
  getCouponStatus,
  normalizeCouponCode,
  type CouponLookupStatus,
} from "./couponMvp";

export const issueCouponSchema = z.object({
  userId: z.string().trim().min(1).max(120).nullable().optional(),
  score: z.number().int().nonnegative(),
});

export const validateCouponSchema = z.object({
  code: z.string().trim().min(4).max(20),
});

export const redeemCouponSchema = z.object({
  code: z.string().trim().min(4).max(20),
  storeId: z.string().trim().min(2).max(64),
  staffId: z.string().trim().min(2).max(64),
  orderNumber: z.string().trim().max(64).optional().or(z.literal("")),
});

export const loginSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("admin"),
    password: z.string().min(1),
  }),
  z.object({
    role: z.literal("staff"),
    password: z.string().min(1),
    storeId: z.string().trim().min(2).max(64),
    staffId: z.string().trim().min(2).max(64),
  }),
]);

export const adminCreateCouponSchema = z.object({
  userId: z.string().trim().max(120).optional().or(z.literal("")),
  couponName: z.string().trim().min(2).max(120).default(COUPON_NAME),
  discountAmount: z.number().int().positive().default(DEFAULT_DISCOUNT_AMOUNT),
  expiresAt: z.string().datetime().optional(),
});

export function getServiceSupabaseOrThrow() {
  const supabase = getServerSupabase();
  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }
  return supabase;
}

export async function ensureCouponExpiredIfNeeded(coupon: {
  id: number;
  status?: string | null;
  expires_at?: string | null;
  redeemed_at?: string | null;
}) {
  const effectiveStatus = getCouponStatus(coupon);
  if (effectiveStatus !== "expired" || coupon.status === "expired") {
    return effectiveStatus;
  }

  const supabase = getServiceSupabaseOrThrow();
  await supabase
    .from("coupons")
    .update({ status: "expired" })
    .eq("id", coupon.id)
    .eq("status", "unused");

  return effectiveStatus;
}

export function serializeCouponSummary(row: any, status?: CouponLookupStatus) {
  const effectiveStatus = status || getCouponStatus(row);
  return {
    id: Number(row.id),
    code: String(row.code),
    couponName: String(row.coupon_name),
    rewardType: String(row.reward_type || COUPON_REWARD_TYPE),
    discountAmount: Number(row.discount_amount || 0),
    status: effectiveStatus,
    reason: getCouponReason(effectiveStatus),
    issuedAt: String(row.issued_at || row.created_at || ""),
    expiresAt: String(row.expires_at || ""),
    redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
    redeemedStoreId: row.redeemed_store_id ? String(row.redeemed_store_id) : null,
    redeemedStaffId: row.redeemed_staff_id ? String(row.redeemed_staff_id) : null,
    orderNumber: row.order_number ? String(row.order_number) : null,
    userId: row.user_id ? String(row.user_id) : null,
  };
}

export async function logCouponAction(input: {
  couponId?: number | null;
  code: string;
  actionType: "validate" | "redeem_success" | "redeem_fail";
  reason?: string | null;
  storeId?: string | null;
  staffId?: string | null;
  orderNumber?: string | null;
}) {
  const supabase = getServiceSupabaseOrThrow();
  await supabase.from("redeem_logs").insert([
    {
      coupon_id: input.couponId ?? null,
      code: normalizeCouponCode(input.code),
      action_type: input.actionType,
      reason: input.reason ?? null,
      store_id: input.storeId ?? null,
      staff_id: input.staffId ?? null,
      order_number: input.orderNumber ?? null,
    },
  ]);
}
