export const GA_ID = "G-R2EF9TM4C5";

type GtagEvent = {
  action: string;
  category?: string;
  label?: string;
  value?: number;
};

export function trackEvent({ action, category, label, value }: GtagEvent) {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (!w.gtag) return;
  w.gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
}
