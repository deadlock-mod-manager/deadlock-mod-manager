import type {
  ModDto,
  ProfileBackup,
  SharedProfile,
} from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useProfileImport } from "@/hooks/use-profile-import";
import { downloadManager } from "@/lib/download/manager";
import { invokeGuarded } from "@/lib/game-guard";
import logger from "@/lib/logger";
import { canDownloadAgain } from "@/lib/mods/installed-helpers";
import { clearProfileMods } from "@/lib/mods/recovery";
import type { ProfileImportOutcome } from "@/lib/profiles/types";
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

// Mods that can't be downloaded again never reach a backup, so they stay.
const removeModsMissingFromBackup = (
  profileId: ProfileId,
  backupProfile: SharedProfile,
) => {
  const state = usePersistedStore.getState();
  const profile = state.profiles[profileId];
  if (!profile) return null;
  const keep = new Set(backupProfile.payload.mods.map((mod) => mod.remoteId));
  // The active profile's live mod list is localMods.
  const mods = [
    ...new Map(
      [
        ...profile.mods,
        ...(state.activeProfileId === profileId ? state.localMods : []),
      ].map((mod) => [mod.remoteId, mod]),
    ).values(),
  ].filter((mod) => !keep.has(mod.remoteId) && canDownloadAgain(mod));
  if (mods.length === 0) return null;
  return clearProfileMods({
    profile,
    mods,
    discardDownload: (remoteId) => downloadManager.discardDownload(remoteId),
    purgeMod: (args) => invokeGuarded<void>("purge_mod", args),
    removeMod: (remoteId, id) =>
      usePersistedStore.getState().removeMod(remoteId, id),
    bumpProfileSyncRevision: (id) =>
      usePersistedStore.getState().bumpProfileSyncRevision(id),
  });
};

export const useRestoreProfileBackup = () => {
  const { t } = useTranslation();
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
    }: RestoreProfileBackupInput): Promise<ProfileImportOutcome> => {
      const outcome =
        destination === "new"
          ? await createProfileFromImport(profile, modsData, {
              profileName: backup.name,
              profileDescription: backup.payload.description,
            })
          : await addToCurrentProfile(profile, modsData);
      const { profileId } = outcome;

      // Old mods go only once the backup's are in, so a restore where nothing
      // installs leaves the profile as it was.
      if (destination === "replace" && outcome.importedCount > 0) {
        const report = await removeModsMissingFromBackup(profileId, profile);
        if (report && report.failures.length > 0) {
          logger
            .withMetadata({ report })
            .warn("Replace restore could not remove some mods");
          toast.error(
            t("cloudBackup.restoreReplaceCleanupFailed", {
              count: report.failures.length,
            }),
          );
        }
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
      return outcome;
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
