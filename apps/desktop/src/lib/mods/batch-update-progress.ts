import type { UpdateProgress } from "@/types/mods";

// Matches the share of a mod's slot that batch_update_mods assigns to downloading.
const DOWNLOAD_SHARE = 0.8;

export const applyDownloadProgress = (
  progress: UpdateProgress | null,
  modId: string,
  percentage: number,
): UpdateProgress | null => {
  if (
    !progress?.isDownloading ||
    progress.currentModId !== modId ||
    progress.downloadPercentage === percentage
  ) {
    return progress;
  }

  const modProgress = (percentage / 100) * DOWNLOAD_SHARE;

  return {
    ...progress,
    downloadPercentage: percentage,
    overallProgress:
      ((progress.completedMods + modProgress) / progress.totalMods) * 100,
  };
};

// Rounded so store subscribers only re-render when the shown percent changes.
export const getUpdatePercent = (
  progress: UpdateProgress | null,
  remoteId?: string,
): number | undefined => {
  if (!progress || (remoteId && !progress.modIds.includes(remoteId))) {
    return undefined;
  }
  return Math.round(progress.overallProgress);
};
