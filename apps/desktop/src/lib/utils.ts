import type { ReportCountsDto } from "@deadlock-mods/shared";
import { CustomSettingType, ModDto } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

import type { LocalMod } from "@/types/mods";
import type { LocalSetting } from "@/types/settings";
import {
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

export const formatSize = (size: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let formattedSize = size;
  let unitIndex = 0;
  while (formattedSize >= 1024 && unitIndex < units.length - 1) {
    formattedSize /= 1024;
    unitIndex++;
  }
  return `${formattedSize.toFixed(2)} ${units[unitIndex]}`;
};

export const formatSpeed = (speed: number) => {
  return `${formatSize(speed)}/s`;
};

export const getAdditionalArgs = async (settings: LocalSetting[]) => {
  const additionalArgs: string[] = [];

  for (const setting of settings.filter(
    (s) =>
      s.type === CustomSettingType.LAUNCH_OPTION &&
      s.enabled &&
      s.id !== "autoexec-launch-option",
  )) {
    additionalArgs.push(`${setting.key} ${setting.value || ""}`.trim());
  }

  const autoexecLaunchOption = settings.find(
    (s) => s.id === "autoexec-launch-option" && s.enabled,
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
      // Autoexec config doesn't exist or failed to load, skip
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
  return mods.sort((a, b) => {
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
        return b.id.localeCompare(a.id);
    }
  });
};

export const isModOutdated = (mod: ModDto) => {
  const cutoffDate = new Date("2026-01-22"); // OldGods update
  const modUpdatedDate = new Date(mod.remoteUpdatedAt);
  return modUpdatedDate < cutoffDate;
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
  const openReportCount = reportCounts.verified + reportCounts.unverified;
  if (openReportCount < reportThreshold) return null;

  const lastUpdatedAt = new Date(mod.remoteUpdatedAt);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  if (lastUpdatedAt >= cutoff) return null;

  return { isStale: true, openReportCount, lastUpdatedAt };
};

export const isUpdatedRecently = (mod: ModDto): boolean => {
  if (!mod.filesUpdatedAt) return false;
  const updatedAt = new Date(mod.filesUpdatedAt).getTime();
  return (
    Date.now() - updatedAt < UPDATED_RECENTLY_MS &&
    updatedAt > UPDATED_RECENTLY_THRESHOLD.getTime()
  );
};

export const isUpdateAvailable = (
  mod: ModDto,
  localMod: LocalMod | null | undefined,
): boolean => {
  if (!localMod || !mod.filesUpdatedAt) return false;
  const installedAt = localMod.downloadedAt;
  if (!installedAt) return false;
  return (
    new Date(installedAt).getTime() < new Date(mod.filesUpdatedAt).getTime()
  );
};
