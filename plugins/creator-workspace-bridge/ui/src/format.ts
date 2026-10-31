import type { TFunction } from "i18next";

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

export function formatBytes(size: number, locale: string): string {
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: BYTE_UNITS[unit],
    unitDisplay: "short",
    minimumFractionDigits: unit === 0 ? 0 : 1,
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** "Today, 10:42", "Yesterday, 22:40", or a full date further back. */
export function formatStagedAt(t: TFunction, iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = date.getTime();
  if (day >= startOfToday.getTime()) return t("time.today", { time });
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (day >= startOfYesterday.getTime()) {
    return t("time.yesterday", { time });
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** DMM names profile folders `profile_<time>_<id>_<name-slug>`; this turns
 * the slug back into a readable name ("test-plugins" -> "Test Plugins"). */
export function profileLabel(folder: string): string {
  const slug = folder.match(/^profile_\d+_[^_]+_(.+)$/)?.[1];
  if (!slug) return folder;
  const words = slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : folder;
}
