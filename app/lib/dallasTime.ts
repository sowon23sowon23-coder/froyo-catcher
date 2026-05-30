export const GAME_TIME_ZONE = "America/Los_Angeles";
export const GAME_TIME_ZONE_LABEL = "California time";

export function getGameTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GAME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getTimeZoneOffsetMs(date: Date) {
  const parts = getGameTimeParts(date);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

export function gameWallTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess)));
  return new Date(utcGuess - getTimeZoneOffsetMs(firstPass));
}

export function getGameDayKey(date = new Date()) {
  const parts = getGameTimeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getGameDayStart(date = new Date()) {
  const parts = getGameTimeParts(date);
  return gameWallTimeToUtc(parts.year, parts.month, parts.day);
}

export function getNextGameDayStart(date = new Date()) {
  const parts = getGameTimeParts(date);
  return gameWallTimeToUtc(parts.year, parts.month, parts.day + 1);
}

export function getGameDateRange(startDate: string, endDate: string) {
  const startParts = startDate.split("-").map(Number);
  const endParts = endDate.split("-").map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return null;
  const [startYear, startMonth, startDay] = startParts;
  const [endYear, endMonth, endDay] = endParts;
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return null;
  const start = gameWallTimeToUtc(startYear, startMonth, startDay);
  const end = gameWallTimeToUtc(endYear, endMonth, endDay + 1);
  if (start.getTime() >= end.getTime()) return null;
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function buildGameRangeDateKeys(startDate: string, endDate: string) {
  const startParts = startDate.split("-").map(Number);
  const endParts = endDate.split("-").map(Number);
  const [startYear, startMonth, startDay] = startParts;
  const [endYear, endMonth, endDay] = endParts;
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return [];

  const keys: string[] = [];
  let cursor = gameWallTimeToUtc(startYear, startMonth, startDay);
  const end = gameWallTimeToUtc(endYear, endMonth, endDay);
  while (cursor.getTime() <= end.getTime() && keys.length < 62) {
    keys.push(getGameDayKey(cursor));
    const parts = getGameTimeParts(cursor);
    cursor = gameWallTimeToUtc(parts.year, parts.month, parts.day + 1);
  }
  return keys;
}

export const dallasWallTimeToUtc = gameWallTimeToUtc;
export const getDallasDayKey = getGameDayKey;
export const getDallasDayStart = getGameDayStart;
export const getNextDallasDayStart = getNextGameDayStart;
