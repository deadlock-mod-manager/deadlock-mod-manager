import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** "812 B", "38 KB", "14.2 MB": whole kilobytes, one decimal above that. */
export const formatPluginSize = (bytes: number) => {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact past times as the plugin designs write them: "2 s ago", "1 h ago", "yesterday". */
export const formatRelativeTime = (t: TFunction, iso: string, now: number) => {
  const elapsed = Math.max(0, now - new Date(iso).getTime());
  if (elapsed < MINUTE) {
    return t("plugins.time.seconds", {
      count: Math.floor(elapsed / SECOND),
    });
  }
  if (elapsed < HOUR) {
    return t("plugins.time.minutes", { count: Math.floor(elapsed / MINUTE) });
  }
  if (elapsed < DAY) {
    return t("plugins.time.hours", { count: Math.floor(elapsed / HOUR) });
  }
  const days = Math.floor(elapsed / DAY);
  if (days < 7) return t("plugins.time.days", { count: days });
  if (days < 30) {
    return t("plugins.time.weeks", { count: Math.floor(days / 7) });
  }
  if (days < 365) {
    return t("plugins.time.months", { count: Math.floor(days / 30) });
  }
  return t("plugins.time.years", { count: Math.floor(days / 365) });
};

/** The current time, refreshed every `intervalMs` so relative labels keep up. */
export const useNow = (intervalMs = 15_000) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
};

/** Formats past times relative to a clock that ticks while mounted. */
export const useRelativeTime = () => {
  const { t } = useTranslation();
  const now = useNow();
  return (iso: string) => formatRelativeTime(t, iso, now);
};

/** "Oct 31" */
export const formatShortDate = (language: string, iso: string) =>
  new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(
    new Date(iso),
  );

/** "Oct 31, 2026, 10:42" */
export const formatDateTime = (language: string, iso: string) =>
  new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

/** "sha256 9f3c…a1e0" */
export const shortHash = (hash: string) =>
  hash.length > 8 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
