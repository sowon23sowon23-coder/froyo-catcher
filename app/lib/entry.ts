export type EntryContactType = "phone" | "email";

export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const domain = email.slice(at + 1);
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  return email;
}

export function formatEntryCode(entryId: number): string {
  return `EVT-${String(entryId).padStart(4, "0")}`;
}

