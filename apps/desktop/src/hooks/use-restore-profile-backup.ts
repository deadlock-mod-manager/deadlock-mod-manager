import type {
  ModDto,
  ProfileBackup,
  SharedProfile,
} from "@deadlock-mods/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfileImport } from "@/hooks/use-profile-import";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { ProfileId } from "@/types/profiles";

export type RestoreDestination = "new" | "replace";

interface RestoreProfileBackupInput {
  backup: ProfileBackup;
  // The backup's profile with identities resolved against the catalog.
  profile: SharedProfile;
  modsData: ModDto[];
  destination: RestoreDestination;
}

export const useRestoreProfileBackup = () => {
  const queryClient = useQueryClient();
  const { createProfileFromImport, addToCurrentProfile, importProgress } =
    useProfileImport();
  const upsertProfile = usePersistedStore((s) => s.upsertProfile);
  const setCloudBackupLink = usePersistedStore((s) => s.setCloudBackupLink);
  const dismissWelcomeBack = usePersistedStore((s) => s.dismissWelcomeBack);

  const mutation = useMutation({
    mutationFn: async ({
      backup,
      profile,
      modsData,
      destination,
    }: RestoreProfileBackupInput): Promise<ProfileId> => {
      let profileId: ProfileId;
      if (destination === "new") {
        profileId = await createProfileFromImport(profile, modsData, {
          profileName: backup.name,
          profileDescription: backup.payload.description,
        });
      } else {
        await addToCurrentProfile(profile, modsData);
        profileId = usePersistedStore.getState().activeProfileId;
      }

      // Groups only point at mods, so drop the ones whose mods didn't install.
      const restored = usePersistedStore.getState().profiles[profileId];
      if (restored && backup.payload.modGroups.length > 0) {
        const installed = new Set(Object.keys(restored.enabledMods));
        upsertProfile({
          ...restored,
          modGroups: backup.payload.modGroups
            .map((group) => ({
              ...group,
              modIds: group.modIds.filter((id) => installed.has(id)),
            }))
            .filter((group) => group.modIds.length > 0),
        });
      }

      setCloudBackupLink(profileId, {
        backupId: backup.id,
        revision: backup.revision,
      });
      dismissWelcomeBack();
      return profileId;
    },
    onError: (error) => {
      // The import flow already told the user what failed.
      logger.withError(error).error("Profile backup restore failed");
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["profile-backups"] }),
  });

  return { restore: mutation, importProgress };
};
