import { dallasWallTimeToUtc } from "./dallasTime";

export const GAME_ACCESS_CONFIG_KEY = "game_access";

export type GameAccessMode = "open" | "closed" | "scheduled";

export type GameAccessConfig = {
  mode: GameAccessMode;
  enabled: boolean;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  blockDate?: string | null;
  blockTime?: string | null;
  closedMessage?: string | null;
  walletAccessEnabled?: boolean;
};

export type GameAccessState = {
  config: GameAccessConfig;
  isOpen: boolean;
  reason: "open" | "closed" | "not_started" | "ended";
  message: string;
  startsAt: string | null;
  endsAt: string | null;
  blocksAt: string | null;
  pageBlocked: boolean;
  walletAccessEnabled: boolean;
};

const DEFAULT_CLOSED_MESSAGE = "The game is currently closed. You can still access your wallet and redeem available coupons.";

function normalizeDateValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeTimeValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function parseDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function parseTimeParts(time: string | null | undefined) {
  if (!time) return { hour: 0, minute: 0 };
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return { hour: 0, minute: 0 };
  return { hour, minute };
}

export function normalizeGameAccessConfig(input: unknown): GameAccessConfig {
  const raw = input && typeof input === "object" ? (input as Partial<GameAccessConfig>) : {};
  const mode = raw.mode === "closed" || raw.mode === "scheduled" || raw.mode === "open" ? raw.mode : "open";
  const closedMessage = typeof raw.closedMessage === "string" && raw.closedMessage.trim()
    ? raw.closedMessage.trim().slice(0, 220)
    : DEFAULT_CLOSED_MESSAGE;

  return {
    mode,
    enabled: raw.enabled !== false,
    startDate: normalizeDateValue(raw.startDate),
    startTime: normalizeTimeValue(raw.startTime),
    endDate: normalizeDateValue(raw.endDate),
    endTime: normalizeTimeValue(raw.endTime),
    blockDate: normalizeDateValue(raw.blockDate),
    blockTime: normalizeTimeValue(raw.blockTime),
    closedMessage,
    walletAccessEnabled: raw.walletAccessEnabled !== false,
  };
}

export function getGameAccessBoundaryIso(dateValue: string | null | undefined, timeValue: string | null | undefined, endFallback = false) {
  if (!dateValue) return null;
  const date = parseDateParts(dateValue);
  if (!date) return null;
  if (endFallback && !timeValue) {
    return dallasWallTimeToUtc(date.year, date.month, date.day + 1).toISOString();
  }
  const time = parseTimeParts(timeValue);
  return dallasWallTimeToUtc(date.year, date.month, date.day, time.hour, time.minute).toISOString();
}

export function resolveGameAccessState(configInput: unknown, now = new Date()): GameAccessState {
  const config = normalizeGameAccessConfig(configInput);
  const startsAt = getGameAccessBoundaryIso(config.startDate, config.startTime, false);
  const endsAt = getGameAccessBoundaryIso(config.endDate, config.endTime, true);
  const blocksAt = getGameAccessBoundaryIso(config.blockDate, config.blockTime, false);
  const walletAccessEnabled = config.walletAccessEnabled !== false;
  const closedMessage = config.closedMessage || DEFAULT_CLOSED_MESSAGE;
  const nowMs = now.getTime();

  const pageBlocked = blocksAt ? nowMs >= new Date(blocksAt).getTime() : false;

  if (config.enabled === false || config.mode === "closed") {
    return { config, isOpen: false, reason: "closed", message: closedMessage, startsAt, endsAt, blocksAt, pageBlocked, walletAccessEnabled };
  }

  if (config.mode === "scheduled") {
    if (startsAt && nowMs < new Date(startsAt).getTime()) {
      return { config, isOpen: false, reason: "not_started", message: closedMessage, startsAt, endsAt, blocksAt, pageBlocked, walletAccessEnabled };
    }
    if (endsAt && nowMs >= new Date(endsAt).getTime()) {
      return { config, isOpen: false, reason: "ended", message: closedMessage, startsAt, endsAt, blocksAt, pageBlocked, walletAccessEnabled };
    }
  }

  return { config, isOpen: true, reason: "open", message: "", startsAt, endsAt, blocksAt, pageBlocked, walletAccessEnabled };
}
