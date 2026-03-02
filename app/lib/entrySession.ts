import { createHmac, timingSafeEqual } from "crypto";

export const ENTRY_SESSION_COOKIE = "entry_session";
const ENTRY_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type EntrySessionPayload = {
  entryId: number;
  nicknameKey: string;
  contactType: "phone" | "email";
  contactValue: string;
  iat: number;
  exp: number;
};

function getSessionSecret() {
  return (
    process.env.ENTRY_SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createEntrySessionToken(input: {
  entryId: number;
  nicknameKey: string;
  contactType: "phone" | "email";
  contactValue: string;
  nowSeconds?: number;
}) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: EntrySessionPayload = {
    entryId: input.entryId,
    nicknameKey: input.nicknameKey,
    contactType: input.contactType,
    contactValue: input.contactValue,
    iat,
    exp: iat + ENTRY_SESSION_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const encodedSig = sign(encodedPayload, secret);
  return `${encodedPayload}.${encodedSig}`;
}

export function verifyEntrySessionToken(token: string): EntrySessionPayload | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const [encodedPayload, encodedSig] = token.split(".");
  if (!encodedPayload || !encodedSig) return null;

  const expected = sign(encodedPayload, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(encodedSig);
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as EntrySessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed?.entryId || !parsed.nicknameKey || !parsed.contactType || !parsed.contactValue) {
      return null;
    }
    if (parsed.contactType !== "phone" && parsed.contactType !== "email") return null;
    if (!parsed.exp || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

