import type { InstalledModInfo } from "@/types/mods";

export interface AddonsBackup {
  file_name: string;
  file_path: string;
  created_at: number;
  file_size: number;
  addons_count: number;
  /** Mods an update backup holds; empty for full backups. */
  mod_names: string[];
}

export type RestoreStrategy = "replace" | "merge";

/** Mods an update backup put back; empty for full restores. */
export interface RestoredBackup {
  profileFolder: string | null;
  mods: InstalledModInfo[];
}

export const UPDATE_BACKUP_PREFIX = "addons-backup-update-";

export const BACKUP_MODES = ["off", "batch", "always"] as const;
export type BackupMode = (typeof BACKUP_MODES)[number];
