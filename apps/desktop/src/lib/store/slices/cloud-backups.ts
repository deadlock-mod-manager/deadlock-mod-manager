import type { StateCreator } from "zustand";
import type { CloudBackupLink } from "@/lib/profiles/profile-backup";
import type { ProfileId } from "@/types/profiles";
import type { State } from "..";

export type CloudBackupsState = {
  // Backup ids come from the server, so two PCs' "Default" profiles back up
  // separately instead of overwriting each other.
  cloudBackupLinks: Record<string, CloudBackupLink>;
  welcomeBackDismissed: boolean;
  setCloudBackupLink: (profileId: ProfileId, link: CloudBackupLink) => void;
  unlinkCloudBackup: (backupId: string) => void;
  dismissWelcomeBack: () => void;
};

export const cloudBackupsDeepMergeKeys =
  [] as const satisfies readonly (keyof CloudBackupsState)[];

export const createCloudBackupsSlice: StateCreator<
  State,
  [],
  [],
  CloudBackupsState
> = (set) => ({
  cloudBackupLinks: {},
  welcomeBackDismissed: false,

  setCloudBackupLink: (profileId, link) =>
    set((state) => ({
      cloudBackupLinks: { ...state.cloudBackupLinks, [profileId]: link },
    })),

  unlinkCloudBackup: (backupId) =>
    set((state) => ({
      cloudBackupLinks: Object.fromEntries(
        Object.entries(state.cloudBackupLinks).filter(
          ([, link]) => link.backupId !== backupId,
        ),
      ),
    })),

  dismissWelcomeBack: () => set({ welcomeBackDismissed: true }),
});
