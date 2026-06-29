const STORE_KEY = "coupon_unlock_notifications";
const UNLOCK_DELAY_MS = 24 * 60 * 60 * 1000;

type ScheduledNotification = {
  token: string;
  unlockAt: string;
  title: string;
  body: string;
};

function readScheduled(): ScheduledNotification[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]") as ScheduledNotification[];
  } catch {
    return [];
  }
}

function writeScheduled(items: ScheduledNotification[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors.
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function scheduleCouponUnlockNotification(params: {
  token: string;
  createdAt: string;
  couponTitle: string;
}): void {
  if (typeof window === "undefined") return;
  const unlockAt = new Date(new Date(params.createdAt).getTime() + UNLOCK_DELAY_MS).toISOString();
  const entry: ScheduledNotification = {
    token: params.token,
    unlockAt,
    title: "Your coupon is ready!",
    body: `Your ${params.couponTitle} is now available to use. Open My Wallet and redeem it within 7 days.`,
  };
  const prev = readScheduled().filter((n) => n.token !== params.token);
  writeScheduled([...prev, entry]);
}

export function cancelCouponUnlockNotification(token: string): void {
  if (typeof window === "undefined") return;
  writeScheduled(readScheduled().filter((n) => n.token !== token));
}

function showNotification(entry: ScheduledNotification): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(entry.title, {
      body: entry.body,
      icon: "/yogurtland-icon.png",
      tag: `coupon-unlock-${entry.token}`,
    });
  } catch {
    // Ignore notification errors in restricted environments.
  }
}

export function activateScheduledNotifications(): () => void {
  if (typeof window === "undefined") return () => {};

  const now = Date.now();
  const all = readScheduled();
  const timers: number[] = [];

  // Show any that already passed (e.g. user opened the page after 24h)
  const overdue = all.filter((n) => new Date(n.unlockAt).getTime() <= now);
  const pending = all.filter((n) => new Date(n.unlockAt).getTime() > now);

  for (const n of overdue) {
    showNotification(n);
  }
  writeScheduled(pending);

  // Schedule future ones
  for (const n of pending) {
    const delay = new Date(n.unlockAt).getTime() - now;
    const timer: number = window.setTimeout(() => {
      showNotification(n);
      writeScheduled(readScheduled().filter((item) => item.token !== n.token));
    }, delay);
    timers.push(timer);
  }

  return () => {
    for (const t of timers) clearTimeout(t);
  };
}
