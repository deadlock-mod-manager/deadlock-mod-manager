export interface AddonsBackup {
  file_name: string;
  file_path: string;
  created_at: number;
  file_size: number;
  addons_count: number;
}

export type RestoreStrategy = "replace" | "merge";
