import type { ProfileBackupRow } from "@deadlock-mods/database";
import type {
  ProfileBackup,
  ProfileBackupPayload,
  ProfileBackupSummary,
} from "../schemas/profile-backup.schemas";

export const toProfileBackupSummaryDto = (
  backup: Omit<ProfileBackupRow, "payload" | "userId">,
): ProfileBackupSummary => ({
  id: backup.id,
  name: backup.name,
  deviceName: backup.deviceName,
  modCount: backup.modCount,
  skippedLocalModCount: backup.skippedLocalModCount,
  contentHash: backup.contentHash,
  revision: backup.revision,
  createdAt: (backup.createdAt ?? new Date()).toISOString(),
  updatedAt: (backup.updatedAt ?? new Date()).toISOString(),
});

export const toProfileBackupDto = (
  backup: ProfileBackupRow,
): ProfileBackup => ({
  ...toProfileBackupSummaryDto(backup),
  payload: backup.payload as ProfileBackupPayload,
});
