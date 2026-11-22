import type { ProfileBackupSummary } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { hostname } from "@tauri-apps/plugin-os";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import {
  deleteProfileBackup,
  listProfileBackups,
  saveProfileBackup,
} from "@/lib/api-client";
import { HttpError } from "@/lib/http-error";
import logger from "@/lib/logger";
import {
  buildProfileBackupPayload,
  getProfileBackupStatus,
  hashProfileBackup,
  profileBackupHashInput,
  type ProfileBackupStatus,
} from "@/lib/profiles/profile-backup";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";
import type { ModProfile, ProfileId } from "@/types/profiles";

const EMPTY_BACKUPS: ProfileBackupSummary[] = [];

const PROFILE_BACKUPS_QUERY_KEY = "profile-backups";

const backupPayloadFor = (
  profile: ModProfile,
  {
    activeProfileId,
    localMods,
  }: { activeProfileId: ProfileId; localMods: LocalMod[] },
) =>
  buildProfileBackupPayload(
    profile,
    profile.id === activeProfileId ? localMods : profile.mods,
  );

/**
 * Backups, each local profile's backup status, and the one backup mutation the
 * local and cloud tabs share so their pending state agrees.
 */
export const useCloudBackups = () => {
  const { user, isAuthenticated } = useAuth();
  const isFeatureEnabled = useExperimentalFeature("cloud-backup");
  const enabled = isFeatureEnabled && isAuthenticated;
  const query = useQuery({
    queryKey: [PROFILE_BACKUPS_QUERY_KEY, user?.sub],
    queryFn: listProfileBackups,
    enabled,
  });
  const backups = query.data ?? EMPTY_BACKUPS;
  const backupsById = useMemo(
    () => new Map(backups.map((backup) => [backup.id, backup])),
    [backups],
  );

  const profiles = usePersistedStore((state) => state.profiles);
  const activeProfileId = usePersistedStore((state) => state.activeProfileId);
  const localMods = usePersistedStore((state) => state.localMods);
  const links = usePersistedStore((state) => state.cloudBackupLinks);

  const sources = useMemo(
    () =>
      Object.values(profiles).map((profile) => ({
        profile,
        hashInput: profileBackupHashInput(
          profile.name,
          backupPayloadFor(profile, { activeProfileId, localMods }),
        ),
      })),
    [profiles, activeProfileId, localMods],
  );

  const hashes = useQueries({
    queries: sources.map(({ hashInput }) => ({
      queryKey: ["profile-backup-hash", hashInput],
      queryFn: () => hashProfileBackup(hashInput),
      staleTime: Number.POSITIVE_INFINITY,
      enabled,
    })),
  });

  const { backupProfile, backupAll } = useBackupProfile();

  const statuses: Record<string, ProfileBackupStatus> = {};
  const localByBackupId = new Map<
    string,
    { profileId: ProfileId; status: ProfileBackupStatus }
  >();
  const profilesToBackUp: ProfileId[] = [];
  sources.forEach(({ profile }, index) => {
    const status = getProfileBackupStatus(
      links[profile.id],
      backupsById,
      hashes[index]?.data,
    );
    statuses[profile.id] = status;
    if (status.kind !== "none") {
      localByBackupId.set(status.backup.id, { profileId: profile.id, status });
    }
    if (
      Object.keys(profile.enabledMods).length > 0 &&
      status.kind !== "upToDate"
    ) {
      profilesToBackUp.push(profile.id);
    }
  });

  return {
    enabled,
    isAuthenticated,
    backups,
    isLoading: query.isLoading,
    statuses,
    localByBackupId,
    profilesToBackUp,
    backupProfile,
    backupAll,
  };
};

export type CloudBackups = ReturnType<typeof useCloudBackups>;

const readDeviceName = async () => {
  try {
    return (await hostname()) ?? "";
  } catch (error) {
    logger.withError(error).warn("Could not read the PC name");
    return "";
  }
};

type BackupResult =
  | { status: "saved"; backup: ProfileBackupSummary }
  | { status: "conflict" };

const useBackupProfile = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const setCloudBackupLink = usePersistedStore((s) => s.setCloudBackupLink);
  const listKey = [PROFILE_BACKUPS_QUERY_KEY, user?.sub];

  const backupOne = async (
    profileId: ProfileId,
    backupsById: ReadonlyMap<string, ProfileBackupSummary>,
    overwrite = false,
  ): Promise<BackupResult> => {
    const { profiles, cloudBackupLinks } = usePersistedStore.getState();
    const profile = profiles[profileId];
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const payload = backupPayloadFor(profile, usePersistedStore.getState());
    const link = cloudBackupLinks[profileId];
    const existing = link && backupsById.get(link.backupId);
    const target =
      link && existing
        ? {
            id: existing.id,
            // Overwriting skips the check by sending the revision the server has.
            expectedRevision: overwrite ? existing.revision : link.revision,
          }
        : {};

    try {
      const backup = await saveProfileBackup({
        ...target,
        name: profile.name,
        deviceName: await readDeviceName(),
        contentHash: await hashProfileBackup(
          profileBackupHashInput(profile.name, payload),
        ),
        payload,
      });
      setCloudBackupLink(profileId, {
        backupId: backup.id,
        revision: backup.revision,
      });
      return { status: "saved", backup };
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        return { status: "conflict" };
      }
      throw error;
    }
  };

  const freshBackupsById = async () => {
    const backups = await queryClient.fetchQuery({
      queryKey: listKey,
      queryFn: listProfileBackups,
      staleTime: 0,
    });
    return new Map(backups.map((backup) => [backup.id, backup]));
  };

  const backupProfile = useMutation({
    mutationFn: async ({
      profileId,
      overwrite = false,
    }: {
      profileId: ProfileId;
      overwrite?: boolean;
    }) => backupOne(profileId, await freshBackupsById(), overwrite),
    onSuccess: (result, { profileId }) => {
      const name = usePersistedStore.getState().profiles[profileId]?.name;
      if (result.status === "conflict") {
        toast.warning(t("cloudBackup.conflictTitle", { name }), {
          description: t("cloudBackup.conflictDescription"),
          action: {
            label: t("cloudBackup.overwrite"),
            onClick: () => backupProfile.mutate({ profileId, overwrite: true }),
          },
        });
        return;
      }
      toast.success(t("cloudBackup.backedUpOne", { name }));
    },
    onError: (error) => {
      logger.withError(error).error("Profile backup failed");
      toast.error(t("cloudBackup.backupError"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  const backupAll = useMutation({
    mutationFn: async (profileIds: ProfileId[]) => {
      const backupsById = await freshBackupsById();
      let saved = 0;
      let modCount = 0;
      let skippedLocalModCount = 0;
      const conflicts: string[] = [];
      for (const profileId of profileIds) {
        const result = await backupOne(profileId, backupsById);
        if (result.status === "conflict") {
          conflicts.push(
            usePersistedStore.getState().profiles[profileId]?.name ?? "",
          );
          continue;
        }
        saved += 1;
        modCount += result.backup.modCount;
        skippedLocalModCount += result.backup.skippedLocalModCount;
      }
      return { saved, modCount, skippedLocalModCount, conflicts };
    },
    onSuccess: ({ saved, modCount, skippedLocalModCount, conflicts }) => {
      const details = [
        t("cloudBackup.backedUpAllDescription", { count: modCount }),
      ];
      if (skippedLocalModCount > 0) {
        details.push(
          t("cloudBackup.localModsStayed", { count: skippedLocalModCount }),
        );
      }
      if (conflicts.length > 0) {
        details.push(
          t("cloudBackup.conflictsSkipped", { names: conflicts.join(", ") }),
        );
      }
      toast.success(t("cloudBackup.backedUpAll", { count: saved }), {
        description: details.join(" "),
      });
    },
    onError: (error) => {
      logger.withError(error).error("Backing up all profiles failed");
      toast.error(t("cloudBackup.backupError"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  });

  return { backupProfile, backupAll };
};

export const useDeleteProfileBackup = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const unlinkCloudBackup = usePersistedStore((s) => s.unlinkCloudBackup);

  return useMutation({
    mutationFn: (backup: ProfileBackupSummary) =>
      deleteProfileBackup(backup.id),
    onSuccess: (_, backup) => {
      unlinkCloudBackup(backup.id);
      toast.success(t("cloudBackup.deleted", { name: backup.name }));
    },
    onError: (error) => {
      logger.withError(error).error("Deleting a profile backup failed");
      toast.error(t("cloudBackup.deleteError"));
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [PROFILE_BACKUPS_QUERY_KEY, user?.sub],
      }),
  });
};
