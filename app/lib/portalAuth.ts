import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import type { PortalRole } from "./couponMvp";

export const PORTAL_SESSION_COOKIE = "yl_portal_session";
export const ADMIN_PAGE_ENTRY_WINDOW_SECONDS = 10;

export type PortalSession = {
  role: PortalRole;
  storeId?: string;
  storeName?: string;
  staffId?: string;
  staffName?: string;
  adminEntryIssuedAt?: number;
  exp: number;
};

function getSessionSecret() {
  return process.env.PORTAL_SESSION_SECRET || process.env.ADMIN_PANEL_TOKEN || "dev-secret";
}

function base64UrlEncode(input: string) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createPortalSessionCookie(session: Omit<PortalSession, "exp">, maxAgeSeconds = 60 * 60 * 12) {
  const payload: PortalSession = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function parsePortalSession(cookieValue?: string | null): PortalSession | null {
  if (!cookieValue) return null;
  const [encodedPayload, providedSignature] = cookieValue.split(".");
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<PortalSession>;
    const role = parsed.role;
    const exp = Number(parsed.exp || 0);
    if ((role !== "admin" && role !== "staff") || !Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      return null;
    }
    return {
      role,
      exp,
      storeId: parsed.storeId ? String(parsed.storeId) : undefined,
      storeName: parsed.storeName ? String(parsed.storeName) : undefined,
      staffId: parsed.staffId ? String(parsed.staffId) : undefined,
      staffName: parsed.staffName ? String(parsed.staffName) : undefined,
      adminEntryIssuedAt: Number.isFinite(Number(parsed.adminEntryIssuedAt)) ? Number(parsed.adminEntryIssuedAt) : undefined,
    };
  } catch {
    return null;
  }
}

export function isFreshAdminPageEntry(session: PortalSession | null) {
  if (!session || session.role !== "admin" || !session.adminEntryIssuedAt) return false;
  return Date.now() - session.adminEntryIssuedAt <= ADMIN_PAGE_ENTRY_WINDOW_SECONDS * 1000;
}

export function writePortalSession(response: NextResponse, session: Omit<PortalSession, "exp">) {
  response.cookies.set(PORTAL_SESSION_COOKIE, createPortalSessionCookie(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearPortalSession(response: NextResponse) {
  response.cookies.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function getPortalSessionFromRequest(req: NextRequest) {
  return parsePortalSession(req.cookies.get(PORTAL_SESSION_COOKIE)?.value);
}

export function requirePortalRole(req: NextRequest, roles: PortalRole[]) {
  const session = getPortalSessionFromRequest(req);
  if (!session || !roles.includes(session.role)) return null;
  return session;
}

export function getPortalSessionFromCookies() {
  return parsePortalSession(cookies().get(PORTAL_SESSION_COOKIE)?.value);
}
