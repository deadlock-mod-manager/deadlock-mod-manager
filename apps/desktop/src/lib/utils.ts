import { CustomSettingType } from '@deadlock-mods/utils';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LocalMod } from '@/types/mods';
import { ModStatus } from '@/types/mods';
import type { LocalSetting } from '@/types/settings';
import { SortType } from './constants';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const formatSize = (size: number) => {
  const units = ['B', 'KB', 'MB', 'GB'];
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
    (s) => s.type === CustomSettingType.LAUNCH_OPTION && s.enabled
  )) {
    additionalArgs.push(`${setting.key} ${setting.value || ''}`.trim());
  }

  return additionalArgs.join(' ');
};
export const compareDates = (
  a: Date | number | undefined,
  b: Date | number | undefined
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

export const isModOutdated = (mod: { remoteUpdatedAt: string | Date }) => {
  const cutoffDate = new Date('2025-08-19');
  const modUpdatedDate = new Date(mod.remoteUpdatedAt);
  return modUpdatedDate < cutoffDate;
};

export const hasModUpdate = (mod: LocalMod): boolean => {
  if (!mod.installedAt) {
    return false;
  }

  const installedAt = new Date(mod.installedAt);
  const remoteUpdatedAt = new Date(mod.remoteUpdatedAt);

  return remoteUpdatedAt > installedAt;
};

export const canModUpdate = (mod: LocalMod): boolean => {
  return mod.status === ModStatus.INSTALLED && hasModUpdate(mod);
};
