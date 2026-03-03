export type EntryContactType = "phone" | "email";

export function normalizeUsPhone(input: string): string | null {
  const raw = input.trim();

  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  // NANP format: NXX-NXX-XXXX where N is 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isValidEmail(email: string): boolean {
  if (!EMAIL_REGEX.test(email)) return false;
  if (email.length > 254) return false;
  const localPart = email.split("@")[0] ?? "";
  if (localPart.length === 0 || localPart.length > 64) return false;
  return true;
}

export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (!isValidEmail(email)) return null;
  return email;
}

export function getContactValidationError(contactType: EntryContactType, rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) {
    return contactType === "phone" ? "Phone number is required." : "Email is required.";
  }

  const normalized = contactType === "phone" ? normalizeUsPhone(value) : normalizeEmail(value);
  if (!normalized) {
    return contactType === "phone"
      ? "Enter a valid US phone number."
      : "Enter a valid email address (e.g. user@example.com).";
  }

  return null;
}

export function formatEntryCode(entryId: number): string {
  return `EVT-${String(entryId).padStart(4, "0")}`;
}
