export const PORTAL_TIME_ZONE = "America/New_York";

export type Greeting = "Good morning" | "Good afternoon" | "Good evening";

/** Hour (0-23) in the company time zone, independent of the server locale. */
export function portalHour(date: Date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(date);

  return Number.parseInt(formatted, 10) % 24;
}

export function greetingForHour(hour: number): Greeting {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
