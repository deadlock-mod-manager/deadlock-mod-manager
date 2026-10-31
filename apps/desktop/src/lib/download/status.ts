import { ModStatus } from "@/types/mods";

export const isDownloadInProgress = (status: ModStatus) =>
  status === ModStatus.Downloading ||
  status === ModStatus.Extracting ||
  status === ModStatus.Paused;

/**
 * Downloads run one at a time, so a mod is Downloading from the moment it is
 * queued. Until the backend starts it, it is only waiting its turn.
 */
export const isDownloadWaiting = (status: ModStatus, started: boolean) =>
  status === ModStatus.Downloading && !started;

// Installation/removal outcomes still refer to successfully downloaded files.
export const isDownloadComplete = (status: ModStatus) =>
  status === ModStatus.Downloaded ||
  status === ModStatus.Installing ||
  status === ModStatus.Installed ||
  status === ModStatus.FailedToInstall ||
  status === ModStatus.Removing ||
  status === ModStatus.Removed ||
  status === ModStatus.FailedToRemove;

export const isDownloadFailed = (status: ModStatus) =>
  status === ModStatus.FailedToDownload || status === ModStatus.Error;
