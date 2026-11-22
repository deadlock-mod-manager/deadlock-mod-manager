import type { InstalledModInfo } from "@/types/mods";
import type { NativeSourceBackupEntry } from "@/types/generated/NativeSourceBackupEntry";

export interface AddonsBackup {
  file_name: string;
  file_path: string;
  created_at: number;
  file_size: number;
  addons_count: number;
  mod_names: string[];
}

export type RestoreStrategy = "replace" | "merge";

export interface RestoredBackup {
  sourceProvenance: NativeSourceBackupEntry[];
  profileFolder: string | null;
  mods: InstalledModInfo[];
}

export const UPDATE_BACKUP_PREFIX = "addons-backup-update-";

export const BACKUP_MODES = ["off", "batch", "always"] as const;
export type BackupMode = (typeof BACKUP_MODES)[number];
