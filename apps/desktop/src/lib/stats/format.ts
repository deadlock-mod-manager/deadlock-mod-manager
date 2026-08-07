import i18n from "@/lib/i18n";

/** Formatting helpers shared by the Stats widgets. */

// Follow the app language, not the OS locale: on a German Windows with the app in
// English, `toLocaleString()` alone turns 1064 souls into "1.064", which reads as
// a decimal.
const activeLocale = (): string => i18n.language || "en";

const percentFormat = (digits: number, signed: boolean) =>
  new Intl.NumberFormat(activeLocale(), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(signed ? { signDisplay: "always" as const } : {}),
  });

export const formatPercent = (value: number, digits = 1): string =>
  percentFormat(digits, false).format(value);

/** Always carries a sign, because the number only means something as a delta. */
export const formatSignedPercent = (value: number, digits = 1): string =>
  // `signDisplay: "always"` would render -0 as "-0%", which reads as a loss.
  percentFormat(digits, true).format(value === 0 ? 0 : value);

// Magnitude, not sign: the soul-lead chart runs negative numbers through here.
export const formatCompact = (value: number): string =>
  Math.abs(value) >= 10_000
    ? new Intl.NumberFormat(activeLocale(), {
        notation: "compact",
        maximumFractionDigits: Math.abs(value) >= 100_000 ? 0 : 1,
      }).format(value)
    : Math.round(value).toLocaleString(activeLocale());

export const formatDecimal = (value: number, digits = 2): string =>
  new Intl.NumberFormat(activeLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const formatDuration = (seconds: number): string => {
  const minutes = Math.round(seconds / 60);
  return i18n.t("stats.duration.hoursMinutes", {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  });
};

/**
 * "m:ss" - match clock and buy times alike. Rounds the total before splitting,
 * because rounding the seconds on their own turns 119.6s into "1:60".
 */
export const formatClock = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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

/**
 * "23:00 - 23:59", used for the hour-of-day insight. Formatted through Intl so a
 * 12-hour locale gets "11:00 PM - 11:59 PM" rather than a forced 24-hour clock.
 */
export const formatHourRange = (hour: number): string => {
  const clock = new Intl.DateTimeFormat(activeLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
  const at = (minute: number) =>
    clock.format(new Date(2000, 0, 1, hour, minute));
  return `${at(0)} - ${at(59)}`;
};
