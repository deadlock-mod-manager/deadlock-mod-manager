import type {
  ModDto,
  ProfileModDownload,
  SharedProfile,
} from "@deadlock-mods/shared";
import type { ProfileImportMod } from "@/types/mods";

export interface ImportProgress {
  currentStep: string;
  currentMod?: string;
  completedMods: number;
  totalMods: number;
  isDownloading: boolean;
  isInstalling: boolean;
}

export type OrderedImportedMod = SharedProfile["payload"]["mods"][number];

export interface AvailableImportedMod {
  importedMod: OrderedImportedMod;
  modData: ModDto;
}

export interface PreparedProfileImportMod {
  importedMod: OrderedImportedMod;
  modData: ModDto;
  profileImportMod: ProfileImportMod;
}

export interface PreparedProfileImport {
  preparedMods: PreparedProfileImportMod[];
  failed: Array<[string, string]>;
}

export interface FetchModsDataResult {
  modsData: ModDto[];
  failed: Array<[string, string]>;
}

export type FetchModsDataEntry =
  | {
      remoteId: string;
      modData: ModDto;
    }
  | {
      remoteId: string;
      error: string;
    };

export type PrepareProfileImportEntry =
  | PreparedProfileImportMod
  | {
      importedMod: OrderedImportedMod;
      error: string;
    };

export interface ProfileImportOptions {
  sourceProfileId?: string;
}

export interface ProfileImportDownloadFile {
  url: string;
  name: string;
  size: number;
}

export interface AvailableImportDownload {
  url: string;
  name: string;
  size?: number | null;
}

export interface ResolveProfileImportDownloadFilesArgs {
  availableDownloads: AvailableImportDownload[];
  selectedDownloads?: ProfileModDownload[];
  selectedDownload?: ProfileModDownload;
}

export interface ResolvedProfileImportDownloadFiles {
  downloadFiles: ProfileImportDownloadFile[];
  missingSelectionNames: string[];
  resolvedWithLiveFallbackNames: string[];
  resolvedWithPersistedFallbackNames: string[];
}
