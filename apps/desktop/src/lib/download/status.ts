import { ModStatus } from "@/types/mods";

export const isDownloadInProgress = (status: ModStatus) =>
  status === ModStatus.Downloading ||
  status === ModStatus.Extracting ||
  status === ModStatus.Paused;

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
