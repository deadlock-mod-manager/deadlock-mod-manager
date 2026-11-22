import type { HeroContent } from "@deadlock-mods/hero-parser";
import type { ModEntryPoint } from "@/lib/analytics/schema";
import type { ModDto } from "@deadlock-mods/shared";
import type { z } from "zod";
import { ModDownloadDtoSchema } from "@deadlock-mods/shared";
import type { VpkParsed } from "@deadlock-mods/vpk-parser";
import type { NativeSourceProvenance } from "@/types/generated/NativeSourceProvenance";
import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";

export type ModDownloadItem = z.infer<typeof ModDownloadDtoSchema>;

export type DownloadSource = "gameBanana" | "other";

export type DownloadFailureReason = "sourceBusy" | "stalled";

export type DownloadFailure = {
  reason: DownloadFailureReason;
  retryAfterSecs: number | null;
};

export type Progress = {
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
  percentage: number;
  source?: DownloadSource | null;
};

export enum ModStatus {
  Downloading = "downloading",
  Extracting = "extracting",
  Paused = "paused",
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
  source?: NativeSourceProvenance;
  metadataPending?: boolean;
  status: ModStatus;
  downloadedAt?: Date;
  downloads?: ModDownloadItem[];
  selectedDownloads?: ModDownloadItem[];
  activeVariantArchive?: string;
  installedVpks?: string[];
  installedFileTree?: ModFileTree;
  installOrder?: number;
  detectedHero?: string | null;
  detectedContent?: HeroContent | null;
  heroOverride?: string | null;
  usesCriticalPaths?: boolean;
  skippedUpdateAt?: number;
  skippedSourceRevision?: string;
  missingVpks?: string[];
  installSource?: string;
}

export interface DownloadableMod extends Omit<LocalMod, "status"> {
  onStart: () => void;
  onProgress: (progress: Progress) => void;
  onComplete: (path: string) => void;
  onError: (error: Error) => void;
  profileFolder?: string | null;
  analyticsEntryPoint?: ModEntryPoint;
  analyticsOperationKind?: "download" | "reinstall" | "retry";
}

export interface FontInfo {
  fileName: string;
  fontName: string;
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

export interface LocalAddonInfo {
  filePath: string;
  fileName: string;
  locator: string;
  vpkParsed: VpkParsed;
  remoteId?: string;
  manifestModId?: string;
  hasEnabledVpkName: boolean;
  matchInfo?: {
    fileId?: string;
    sourcePath?: string;
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

export interface AddonAnalysisProgress {
  step: "scanning" | "parsing" | "analyzing_hashes" | "complete";
  stepDescription: string;
  filesFound?: number;
  currentFile?: number;
  currentFileName?: string;
  totalProgress: number;
}

export interface ProfileImportMod {
  installedSource?: NativeSourceProvenance;
  sourceComponentIds?: string[];
  enabled?: boolean;
  modId: string;
  modName: string;
  downloadFiles: Array<{
    url: string;
    name: string;
    size: number;
  }>;
  fileTree?: ModFileTree;
  installedVpks?: string[];
  installedFileTree?: ModFileTree;
  isMap?: boolean;
}

export interface ProfileImportProgressEvent {
  currentStep: string;
  currentModIndex: number;
  totalMods: number;
  currentModName: string;
  overallProgress: number;
}

export interface InstalledModInfo {
  modId: string;
  modName: string;
  installedVpks: string[];
  fileTree?: ModFileTree;
}

export interface ProfileImportResult {
  profileFolder: string;
  succeeded: string[];
  failed: Array<[string, string]>;
  installedMods: InstalledModInfo[];
}

export interface BatchUpdateResult {
  backupName: string;
  succeeded: string[];
  failed: Array<[string, string]>;
  installedMods: InstalledModInfo[];
  vpkMappings?: Array<[string, string[]]>;
  selectionRequired: PendingSelection[];
}

export interface PendingSelection {
  modId: string;
  modName: string;
  fileTree: ModFileTree;
}

export interface BatchUpdateProgressEvent {
  currentStep: string;
  currentModIndex: number;
  totalMods: number;
  currentModId: string;
  currentModName: string;
  overallProgress: number;
}

export interface UpdateProgress {
  currentStep: string;
  modIds: string[];
  currentModId?: string;
  currentMod?: string;
  downloadPercentage?: number;
  backupPercentage?: number;
  completedMods: number;
  totalMods: number;
  overallProgress: number;
  isBackingUp?: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
}

export interface UpdatableMod {
  mod: ModDto & { source?: NativeSourceProvenance };
  nativeInstallation?: NativeSourceInstallation;
  nativeSelectionRequired?: boolean;
  updatedAt?: number;
  downloads: ModDownloadItem[];
  selectedDownloads: ModDownloadItem[];
  selectedFileTree?: ModFileTree;
}

export type ModUpdateCandidate = Pick<
  UpdatableMod,
  "mod" | "updatedAt" | "downloads" | "nativeInstallation"
>;
