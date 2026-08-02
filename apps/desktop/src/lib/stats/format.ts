import i18n from "@/lib/i18n";

/** Formatting helpers shared by the Stats widgets. */

// Follow the app language, not the OS locale: on a German Windows with the app in
// English, `toLocaleString()` alone turns 1064 souls into "1.064", which reads as
// a decimal.
const activeLocale = (): string => i18n.language || "en";

export const formatPercent = (value: number, digits = 1): string =>
  `${(value * 100).toFixed(digits)}%`;

export const formatSignedPercent = (value: number, digits = 1): string =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;

export const formatCompact = (value: number): string =>
  value >= 10_000
    ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`
    : Math.round(value).toLocaleString(activeLocale());

export const formatDecimal = (value: number, digits = 2): string =>
  value.toFixed(digits);

export const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/** Short date for axis ticks, e.g. "14 Mar". */
export const formatDayTick = (unixSeconds: number, locale: string): string =>
  new Date(unixSeconds * 1000).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });

export const formatDateTime = (unixSeconds: number, locale: string): string =>
  new Date(unixSeconds * 1000).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

/** "23:00 - 23:59", used for the hour-of-day insight. */
export const formatHourRange = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00 - ${String(hour).padStart(2, "0")}:59`;
