import type {
  ModDto,
  ProfileModDownload,
  SharedProfile,
} from "@deadlock-mods/shared";
import type { ModDownloadItem, ProfileImportMod } from "@/types/mods";
import type { ProfileId } from "@/types/profiles";

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

/** The mod's files and the ones the import fetched, kept on the imported mod
 *  so sharing the profile on passes the same picks. */
export interface ImportedModDownloads {
  downloads: ModDownloadItem[];
  selectedDownloads: ModDownloadItem[];
}

export interface PreparedProfileImportMod {
  importedMod: OrderedImportedMod;
  modData: ModDto;
  profileImportMod: ProfileImportMod;
  downloads: ImportedModDownloads;
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
  profileName?: string;
  profileDescription?: string;
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

/** Where an imported mod dropped out: its catalog lookup, fetching its
 *  download list, or the batch download and install. The batch reports all of
 *  its errors as one string, so it stays a single step. */
export type ImportFailureStep = "lookup" | "downloads" | "install";

export interface ImportFailure {
  remoteId: string;
  name: string | null;
  step: ImportFailureStep;
  error: string | null;
}

/** What an import did, for the dialog that started it to report. */
export interface ProfileImportOutcome {
  profileId: ProfileId;
  profileName: string;
  importedCount: number;
  totalCount: number;
  failures: ImportFailure[];
}
