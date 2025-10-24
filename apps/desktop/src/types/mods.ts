import type { ModDownloadDto, ModDto } from "@deadlock-mods/shared";
import type { VpkParsed } from "@deadlock-mods/vpk-parser";

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
  downloadedAt?: Date | string;
  downloads?: ModDownloadItem[];
  selectedDownload?: ModDownloadItem;
  installedVpks?: string[];
  installedFileTree?: ModFileTree;
  installOrder?: number; // Order in which the mod should be loaded (lower numbers load first)
  installedRemoteUpdatedAt?: Date | string;
  isUpdateAvailable?: boolean;
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

// Types for local addon analysis
export interface LocalAddonInfo {
  filePath: string;
  fileName: string;
  vpkParsed: VpkParsed;
  remoteId?: string; // Will be populated by API call
  matchInfo?: {
    certainty: number;
    matchType: "sha256" | "contentSignature" | "fastHashAndSize" | "merkleRoot";
    modName?: string;
    modAuthor?: string;
    alternativeMatches?: Array<{
      id: string;
      modName: string;
      modAuthor: string;
    }>;
  };
}

export interface AnalyzeAddonsResult {
  addons: LocalAddonInfo[];
  totalCount: number;
  errors: string[];
}

// Progress reporting for addon analysis
export interface AddonAnalysisProgress {
  step: "scanning" | "parsing" | "analyzing_hashes" | "complete";
  stepDescription: string;
  filesFound?: number;
  currentFile?: number;
  currentFileName?: string;
  totalProgress: number; // 0-100
}

// Type for mod identification API response (stub for now)
export interface ModIdentificationRequest {
  vpkHash: string;
  contentSignature: string;
  merkleRoot?: string;
  fileCount: number;
  fileName: string;
}

export interface ModIdentificationResponse {
  remoteId?: string;
  confidence?: number;
  modName?: string;
  modAuthor?: string;
}
