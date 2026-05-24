export const GAME_TIME_ZONE = "America/Chicago";

function getDallasParts(date: Date) {
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
  const parts = getDallasParts(date);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

export function dallasWallTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess)));
  return new Date(utcGuess - getTimeZoneOffsetMs(firstPass));
}

export function getDallasDayKey(date = new Date()) {
  const parts = getDallasParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getDallasDayStart(date = new Date()) {
  const parts = getDallasParts(date);
  return dallasWallTimeToUtc(parts.year, parts.month, parts.day);
}

export function getNextDallasDayStart(date = new Date()) {
  const parts = getDallasParts(date);
  return dallasWallTimeToUtc(parts.year, parts.month, parts.day + 1);
}
