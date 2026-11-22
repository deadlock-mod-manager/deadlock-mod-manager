import i18n from "@/lib/i18n";

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

export const formatSignedPercent = (value: number, digits = 1): string =>
  percentFormat(digits, true).format(value === 0 ? 0 : value);

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

export const formatClock = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

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

export const formatHourRange = (hour: number): string => {
  const clock = new Intl.DateTimeFormat(activeLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
  const at = (minute: number) =>
    clock.format(new Date(2000, 0, 1, hour, minute));
  return `${at(0)} - ${at(59)}`;
};

export const formatThousands = (value: number, digits = 1): string =>
  Math.abs(value) >= 1000
    ? `${formatDecimal(value / 1000, digits)}k`
    : String(Math.round(value));

export const formatSignedThousands = (value: number): string =>
  `${value >= 0 ? "+" : "−"}${formatThousands(Math.abs(value))}`;

export const formatKda = (
  kills: number | null,
  deaths: number | null,
  assists: number | null,
  separator = " / ",
): string =>
  [kills, deaths, assists]
    .map((value) => (value === null ? "–" : String(value)))
    .join(separator);

export const formatWhole = (value: number): string =>
  Math.round(value).toLocaleString(activeLocale());
