import {
  ModDto,
  type ReportCountsDto,
  formatByteRate,
  formatByteSize,
} from "@deadlock-mods/shared";
import { addDays, format, getUnixTime, parse, subDays } from "date-fns";
import { platform } from "@tauri-apps/plugin-os";

import type { DateFilter } from "@/lib/store/slices/ui";
import {
  MOD_OUTDATED_CUTOFF_SECONDS,
  STALE_MOD_DAYS,
  STALE_MOD_REPORT_THRESHOLD,
  SortType,
  UPDATED_RECENTLY_MS,
  UPDATED_RECENTLY_THRESHOLD,
} from "./constants";

export { cn } from "@deadlock-mods/ui/lib/utils";

export async function getOsType(): Promise<string> {
  try {
    const osPlatform = await platform();
    return osPlatform.toLowerCase();
  } catch {
    return "unknown";
  }
}

export function isMacOS(osType: string): boolean {
  return osType === "darwin" || osType === "macos";
}

export const formatSize = formatByteSize;
export const formatSpeed = formatByteRate;

export const compareDates = (
  a: Date | number | undefined,
  b: Date | number | undefined,
) => {
  if (!a) {
    return -1;
  }
  if (!b) {
    return 1;
  }
  return new Date(a).getTime() - new Date(b).getTime();
};

export const sortMods = <T extends ModDto>(mods: T[], sortType: SortType) => {
  return [...mods].sort((a, b) => {
    switch (sortType) {
      case SortType.LAST_UPDATED:
        return compareDates(b.remoteUpdatedAt, a.remoteUpdatedAt);
      case SortType.DOWNLOADS:
        return b.downloadCount - a.downloadCount;
      case SortType.RATING:
        return b.likes - a.likes;
      case SortType.RELEASE_DATE:
        return compareDates(b.remoteAddedAt, a.remoteAddedAt);
      default:
        return b.downloadCount - a.downloadCount;
    }
  });
};

export const FILTER_DATE_FORMAT = "yyyy-MM-dd";

/** Parses a date filter date (YYYY-MM-DD) as local midnight. */
export const parseFilterDate = (date: string): Date | undefined =>
  date ? parse(date, FILTER_DATE_FORMAT, new Date()) : undefined;

/** Formats a date filter date for display, e.g. "Sep 1, 2026". */
export const formatFilterDate = (date: string): string => {
  const parsed = parseFilterDate(date);
  return parsed ? format(parsed, "MMM d, yyyy") : "";
};

// A `[after, before)` range in unix seconds; `null` leaves that side open.
type DateRange = { after: number | null; before: number | null };

const DATE_PERIOD_DAYS = {
  "24h": 1,
  "7d": 7,
  "14d": 14,
  "28d": 28,
  "1y": 365,
};

export const getDateRange = (filter: DateFilter): DateRange => {
  switch (filter.period) {
    case "24h":
    case "7d":
    case "14d":
    case "28d":
    case "1y": {
      const days = DATE_PERIOD_DAYS[filter.period];
      return { after: getUnixTime(subDays(new Date(), days)), before: null };
    }
    case "custom": {
      const from = parseFilterDate(filter.from);
      const to = parseFilterDate(filter.to);
      return {
        after: from ? getUnixTime(from) : null,
        // `to` is inclusive, so the range ends at the next local midnight.
        before: to ? getUnixTime(addDays(to, 1)) : null,
      };
    }
    default:
      return { after: null, before: null };
  }
};

export const isDateFilterActive = (filter: DateFilter): boolean =>
  filter.period !== "any" &&
  (filter.period !== "custom" || Boolean(filter.from || filter.to));

export const isModOutdated = (mod: ModDto): boolean => {
  const modUpdatedDate = new Date(mod.remoteUpdatedAt);
  return modUpdatedDate.getTime() < MOD_OUTDATED_CUTOFF_SECONDS * 1_000;
};

export type StaleModResult = {
  isStale: true;
  openReportCount: number;
  lastUpdatedAt: Date;
};

export const isModStale = (
  mod: ModDto,
  reportCounts: ReportCountsDto,
  reportThreshold = STALE_MOD_REPORT_THRESHOLD,
  staleDays = STALE_MOD_DAYS,
): StaleModResult | null => {
  if (reportCounts.total < reportThreshold) return null;

  const lastUpdatedAt = new Date(mod.remoteUpdatedAt);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  if (lastUpdatedAt >= cutoff) return null;

  return { isStale: true, openReportCount: reportCounts.total, lastUpdatedAt };
};

export const isUpdatedRecently = (mod: ModDto): boolean => {
  if (!mod.filesUpdatedAt) return false;
  const updatedAt = new Date(mod.filesUpdatedAt).getTime();
  return (
    Date.now() - updatedAt < UPDATED_RECENTLY_MS &&
    updatedAt > UPDATED_RECENTLY_THRESHOLD.getTime()
  );
};
