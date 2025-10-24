import { CustomSettingType } from "@deadlock-mods/shared";

import type { LocalMod } from "@/types/mods";
import type { LocalSetting } from "@/types/settings";
import { SortType } from "./constants";

export { cn } from "@deadlock-mods/ui/lib/utils";

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

export const getAdditionalArgs = (settings: LocalSetting[]) => {
  const additionalArgs: string[] = [];

  for (const setting of settings.filter(
    (s) => s.type === CustomSettingType.LAUNCH_OPTION && s.enabled,
  )) {
    additionalArgs.push(`${setting.key} ${setting.value || ""}`.trim());
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

const toTimestamp = (
  value: Date | string | null | undefined,
): number | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

export const isModOutdated = (mod: {
  remoteUpdatedAt?: Date | string | null;
  installedRemoteUpdatedAt?: Date | string | null;
  isUpdateAvailable?: boolean;
}) => {
  if (typeof mod.isUpdateAvailable === "boolean") {
    return mod.isUpdateAvailable;
  }

  const remoteTimestamp = toTimestamp(mod.remoteUpdatedAt ?? undefined);
  const installedTimestamp = toTimestamp(
    mod.installedRemoteUpdatedAt ?? undefined,
  );

  if (remoteTimestamp === undefined || installedTimestamp === undefined) {
    return false;
  }

  return remoteTimestamp > installedTimestamp;
};
