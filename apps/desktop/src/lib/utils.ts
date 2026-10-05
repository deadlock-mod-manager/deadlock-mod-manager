import {
  CustomSettingType,
  ModDto,
  type ReportCountsDto,
  formatByteRate,
  formatByteSize,
} from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import {
  addDays,
  format,
  getUnixTime,
  parse,
  startOfDay,
  subDays,
} from "date-fns";
import { platform } from "@tauri-apps/plugin-os";

import type { LocalMod } from "@/types/mods";
import type { LocalSetting } from "@/types/settings";
import type { AddedFilter } from "@/lib/store/slices/ui";
import { AUTOEXEC_LAUNCH_OPTION_ID } from "@/lib/autoexec/constants";
import {
  MOD_OUTDATED_CUTOFF_SECONDS,
  STALE_MOD_DAYS,
  STALE_MOD_REPORT_THRESHOLD,
  SortType,
  TimePeriod,
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

export const getAdditionalArgs = async (
  settings: LocalSetting[],
  gamePresenceEnabled: boolean,
) => {
  const additionalArgs: string[] = [];

  if (gamePresenceEnabled) {
    additionalArgs.push("-condebug");
  }

  for (const setting of settings.filter(
    (s) =>
      s.type === CustomSettingType.LAUNCH_OPTION &&
      s.enabled &&
      s.id !== AUTOEXEC_LAUNCH_OPTION_ID,
  )) {
    additionalArgs.push(`${setting.key} ${setting.value || ""}`.trim());
  }

  const autoexecLaunchOption = settings.find(
    (s) => s.id === AUTOEXEC_LAUNCH_OPTION_ID && s.enabled,
  );

  if (autoexecLaunchOption) {
    try {
      const autoexecConfig = await invoke<{
        full_content: string;
      }>("get_autoexec_config");
      if (
        autoexecConfig?.full_content &&
        autoexecConfig.full_content.trim().length > 0
      ) {
        additionalArgs.push("-exec autoexec");
      }
    } catch {
      return additionalArgs.join(" ");
    }
  }

  return additionalArgs.join(" ");
};
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

export const sortMods = (mods: LocalMod[], sortType: SortType) => {
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

export const getTimePeriodCutoff = (period: TimePeriod): Date | null => {
  if (period === TimePeriod.ALL_TIME) return null;
  const now = new Date();
  switch (period) {
    case TimePeriod.PAST_WEEK:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case TimePeriod.PAST_MONTH:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case TimePeriod.PAST_3_MONTHS:
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case TimePeriod.PAST_YEAR:
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
};

export const ADDED_DATE_FORMAT = "yyyy-MM-dd";

/** Parses an "Added" filter date (YYYY-MM-DD) as local midnight. */
export const parseAddedDate = (date: string): Date | undefined =>
  date ? parse(date, ADDED_DATE_FORMAT, new Date()) : undefined;

/** Formats an "Added" filter date for display, e.g. "Sep 1, 2026". */
export const formatAddedDate = (date: string): string => {
  const parsed = parseAddedDate(date);
  return parsed ? format(parsed, "MMM d, yyyy") : "";
};

// A `[after, before)` range in unix seconds; `null` leaves that side open.
type AddedRange = { after: number | null; before: number | null };

export const getAddedRange = (filter: AddedFilter): AddedRange => {
  switch (filter.period) {
    case "today":
      return { after: getUnixTime(startOfDay(new Date())), before: null };
    case "week":
      return { after: getUnixTime(subDays(new Date(), 7)), before: null };
    case "month":
      return { after: getUnixTime(subDays(new Date(), 30)), before: null };
    case "custom": {
      const from = parseAddedDate(filter.from);
      const to = parseAddedDate(filter.to);
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

export const isAddedFilterActive = (filter: AddedFilter): boolean =>
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
