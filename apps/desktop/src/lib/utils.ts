import { LocalMod } from '@/types/mods';
import { LocalSetting } from '@/types/settings';
import { CustomSettingType } from '@deadlock-mods/utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
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
  const additionalArgs = [];

  for (const setting of settings.filter((s) => s.type === CustomSettingType.LAUNCH_OPTION)) {
    additionalArgs.push(`+${setting.key} ${setting.value}`);
  }

  return additionalArgs.join(' ');
};
export const compareDates = (a: Date | number | undefined, b: Date | number | undefined) => {
  if (!a) return -1;
  if (!b) return 1;
  return new Date(a).getTime() - new Date(b).getTime();
};

export const sortMods = (mods: LocalMod[], sortType: SortType) => {
  return mods.sort((a, b) => {
    switch (sortType) {
      case SortType.LAST_UPDATED:
        return compareDates(b.updatedAt, a.updatedAt);
      case SortType.DOWNLOADS:
        return b.downloadCount - a.downloadCount;
      case SortType.RATING:
        return b.likes - a.likes;
      case SortType.RELEASE_DATE:
        return compareDates(b.createdAt, a.createdAt);
      default:
        return b.id.localeCompare(a.id);
    }
  });
};
