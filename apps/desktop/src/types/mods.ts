import type { ModDownloadDto, ModDto } from "@deadlock-mods/utils";

// Individual download item type extracted from ModDownloadDto array
export type ModDownloadItem = ModDownloadDto[number];

export type Progress = {
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
};

export enum ModStatus {
  Downloading = "downloading",
  Downloaded = "downloaded",
  FailedToDownload = "failedToDownload",
  Installing = "installing",
  Installed = "installed",
  FailedToInstall = "failedToInstall",
  Removing = "removing",
  Removed = "removed",
  FailedToRemove = "failedToRemove",
  Error = "error",
}

export interface LocalMod extends ModDto {
  status: ModStatus;
  downloadedAt?: Date;
  path?: string;
  downloads?: ModDownloadItem[];
  installedVpks?: string[];
  installedFileTree?: ModFileTree;
}

export interface DownloadableMod extends Omit<LocalMod, "status"> {
  onStart: () => void;
  onProgress: (progress: Progress) => void;
  onComplete: (path: string) => void;
  onError: (error: Error) => void;
}

export type InstallableMod = {
  id: string;
  name: string;
  path: string;
  installed_vpks: string[];
  file_tree?: ModFileTree;
};

export interface ModFile {
  name: string;
  path: string;
  size: number;
  is_selected: boolean;
  archive_name: string;
}

export interface ModFileTree {
  files: ModFile[];
  total_files: number;
  has_multiple_files: boolean;
}

export interface LocalModWithFiles extends LocalMod {
  file_tree?: ModFileTree;
}
