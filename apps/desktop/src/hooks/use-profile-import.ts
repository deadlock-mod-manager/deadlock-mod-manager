import {
  getOrderedSharedProfileMods,
  type ModDto,
  type SharedProfile,
} from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMod, getModDownloads } from "@/lib/api";
import logger from "@/lib/logger";
import { resolveProfileImportDownloadFiles } from "@/lib/profiles/import-downloads";
import {
  applyUpdatedVpkMappings,
  buildProfileReorderData,
} from "@/lib/profiles/profile-reorder";
import {
  buildImportedProfileRetryPayload,
  getImportedProfileMissingRemoteIds,
} from "@/lib/profiles/import-recovery";
import { usePersistedStore } from "@/lib/store";
import type {
  LocalMod,
  InstalledModInfo,
  ProfileImportMod,
  ProfileImportProgressEvent,
  ProfileImportResult,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type {
  ModProfile,
  ProfileId,
  ProfileImportMetadata,
} from "@/types/profiles";
import { createProfileId } from "@/types/profiles";

export interface ImportProgress {
  currentStep: string;
  currentMod?: string;
  completedMods: number;
  totalMods: number;
  isDownloading: boolean;
  isInstalling: boolean;
}

type OrderedImportedMod = ReturnType<
  typeof getOrderedSharedProfileMods
>[number];

interface AvailableImportedMod {
  importedMod: OrderedImportedMod;
  modData: ModDto;
}

interface PreparedProfileImportMod {
  importedMod: OrderedImportedMod;
  modData: ModDto;
  profileImportMod: ProfileImportMod;
}

interface PreparedProfileImport {
  preparedMods: PreparedProfileImportMod[];
  failed: Array<[string, string]>;
}

interface FetchModsDataResult {
  modsData: ModDto[];
  failed: Array<[string, string]>;
}

type FetchModsDataEntry =
  | {
      remoteId: string;
      modData: ModDto;
    }
  | {
      remoteId: string;
      error: string;
    };

type PrepareProfileImportEntry =
  | PreparedProfileImportMod
  | {
      importedMod: OrderedImportedMod;
      error: string;
    };

interface ProfileImportOptions {
  sourceProfileId?: string;
}

interface RetryProfileImportResult {
  attemptedCount: number;
  recoveredCount: number;
  remainingCount: number;
}

const IMPORTED_PROFILE_DESCRIPTION = "Profile imported from shared profile ID";

const serializeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const createImportedProfileName = () =>
  `Imported Profile - ${new Date().toLocaleDateString()}`;

const createImportMetadata = (
  importedProfile: SharedProfile,
  sourceProfileId?: string,
): ProfileImportMetadata => ({
  sourceProfileId,
  sharedProfile: importedProfile,
  importedAt: new Date().toISOString(),
});

const sortModsByInstallOrder = (mods: LocalMod[]): LocalMod[] =>
  [...mods].sort(
    (left, right) =>
      (left.installOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.installOrder ?? Number.MAX_SAFE_INTEGER),
  );

const resolveImportContext = (
  importedProfile: SharedProfile,
  modsData: ModDto[],
) => {
  const importedMods = getOrderedSharedProfileMods(importedProfile);
  const installOrderByRemoteId = new Map(
    importedMods.map((mod, index) => [mod.remoteId, index]),
  );
  const modsDataByRemoteId = new Map(
    modsData.map((mod) => [mod.remoteId, mod]),
  );
  const availableImportedMods = importedMods
    .map((importedMod) => {
      const modData = modsDataByRemoteId.get(importedMod.remoteId);
      return modData ? { importedMod, modData } : null;
    })
    .filter((entry): entry is AvailableImportedMod => entry !== null);

  return {
    importedMods,
    availableImportedMods,
    installOrderByRemoteId,
    modsDataByRemoteId,
    unavailableModsCount: importedMods.length - availableImportedMods.length,
  };
};

const persistProfileImportMetadata = (
  profileId: ProfileId,
  importedProfile: SharedProfile,
  sourceProfileId?: string,
) => {
  usePersistedStore.setState((state) => {
    const profile = state.profiles[profileId];

    if (!profile) {
      return state;
    }

    return {
      profiles: {
        ...state.profiles,
        [profileId]: {
          ...profile,
          importMetadata: createImportMetadata(
            importedProfile,
            sourceProfileId,
          ),
        },
      },
    };
  });
};

const setProfileFolderName = (profileId: ProfileId, folderName: string) => {
  usePersistedStore.setState((state) => {
    const profile = state.profiles[profileId];

    if (!profile) {
      return state;
    }

    return {
      profiles: {
        ...state.profiles,
        [profileId]: {
          ...profile,
          folderName,
        },
      },
    };
  });
};

const createProfileFolder = async (
  profileId: ProfileId,
  profileName: string,
): Promise<string> => {
  const folderName = await invoke<string>("create_profile_folder", {
    profileId,
    profileName,
  });

  setProfileFolderName(profileId, folderName);
  return folderName;
};

const fetchModsData = async (
  remoteIds: string[],
): Promise<FetchModsDataResult> => {
  const results: FetchModsDataEntry[] = await Promise.all(
    Array.from(new Set(remoteIds)).map(async (remoteId) => {
      try {
        return {
          remoteId,
          modData: await getMod(remoteId),
        };
      } catch (error) {
        return {
          remoteId,
          error: serializeError(error),
        };
      }
    }),
  );

  return results.reduce<FetchModsDataResult>(
    (accumulator, result) => {
      if ("modData" in result) {
        accumulator.modsData.push(result.modData);
      } else {
        accumulator.failed.push([result.remoteId, result.error]);
      }

      return accumulator;
    },
    { modsData: [], failed: [] },
  );
};

const prepareProfileImportMods = async (
  availableImportedMods: AvailableImportedMod[],
): Promise<PreparedProfileImport> => {
  const results: PrepareProfileImportEntry[] = await Promise.all(
    availableImportedMods.map(async ({ importedMod, modData }) => {
      try {
        const downloadsResponse = await getModDownloads(modData.remoteId);
        const downloadFiles = downloadsResponse.downloads || [];

        const resolvedDownloadFiles = resolveProfileImportDownloadFiles({
          availableDownloads: downloadFiles,
          selectedDownloads: importedMod.selectedDownloads,
          selectedDownload: importedMod.selectedDownload,
        });

        if (resolvedDownloadFiles.downloadFiles.length === 0) {
          throw new Error("No download files available for import");
        }

        if (resolvedDownloadFiles.resolvedWithLiveFallbackNames.length > 0) {
          logger
            .withMetadata({
              modId: modData.remoteId,
              modName: modData.name,
              renamedSelectionNames:
                resolvedDownloadFiles.resolvedWithLiveFallbackNames,
              availableDownloadCount: downloadFiles.length,
            })
            .warn(
              "Using current live download entries for renamed imported selections",
            );
        }

        if (
          resolvedDownloadFiles.resolvedWithPersistedFallbackNames.length > 0
        ) {
          logger
            .withMetadata({
              modId: modData.remoteId,
              modName: modData.name,
              missingSelectionNames:
                resolvedDownloadFiles.resolvedWithPersistedFallbackNames,
              availableDownloadCount: downloadFiles.length,
            })
            .warn("Falling back to persisted imported download selection");
        }

        return {
          importedMod,
          modData,
          profileImportMod: {
            modId: modData.remoteId,
            modName: modData.name,
            downloadFiles: resolvedDownloadFiles.downloadFiles.map(
              (download) => ({
                url: download.url,
                name: download.name,
                size: download.size,
              }),
            ),
            fileTree: importedMod.fileTree
              ? {
                  ...importedMod.fileTree,
                  files: importedMod.fileTree.files.some(
                    (file) => file.is_selected,
                  )
                    ? importedMod.fileTree.files
                    : importedMod.fileTree.files.map((file) => ({
                        ...file,
                        is_selected: true,
                      })),
                }
              : undefined,
            isMap: modData.isMap,
          },
        } satisfies PreparedProfileImportMod;
      } catch (error) {
        return {
          importedMod,
          error: serializeError(error),
        };
      }
    }),
  );

  return results.reduce<PreparedProfileImport>(
    (accumulator, result) => {
      if ("profileImportMod" in result) {
        accumulator.preparedMods.push(result);
      } else {
        accumulator.failed.push([result.importedMod.remoteId, result.error]);
      }

      return accumulator;
    },
    { preparedMods: [], failed: [] },
  );
};

const applyImportedModsToProfileState = (
  profileId: ProfileId,
  installedMods: InstalledModInfo[],
  modsDataByRemoteId: Map<string, ModDto>,
  installOrderByRemoteId: Map<string, number>,
) => {
  usePersistedStore.setState((state) => {
    const profile = state.profiles[profileId];

    if (!profile) {
      return state;
    }

    const now = new Date();
    const updateActiveLocalMods = state.activeProfileId === profileId;
    const nextProfileMods = [...profile.mods];
    const profileIndexesByRemoteId = new Map(
      nextProfileMods.map((mod, index) => [mod.remoteId, index]),
    );
    const nextEnabledMods = { ...profile.enabledMods };
    const nextLocalMods = updateActiveLocalMods
      ? [...state.localMods]
      : state.localMods;
    const localIndexesByRemoteId = updateActiveLocalMods
      ? new Map(nextLocalMods.map((mod, index) => [mod.remoteId, index]))
      : null;

    for (const installedMod of installedMods) {
      const modData = modsDataByRemoteId.get(installedMod.modId);

      if (!modData) {
        continue;
      }

      const installOrder = installOrderByRemoteId.get(installedMod.modId);
      const existingProfileIndex = profileIndexesByRemoteId.get(
        installedMod.modId,
      );
      const existingProfileMod =
        existingProfileIndex === undefined
          ? undefined
          : nextProfileMods[existingProfileIndex];
      const existingLocalIndex = localIndexesByRemoteId?.get(
        installedMod.modId,
      );
      const existingLocalMod =
        existingLocalIndex === undefined
          ? undefined
          : nextLocalMods[existingLocalIndex];
      const baseMod = existingProfileMod ?? existingLocalMod;

      const nextMod: LocalMod = {
        ...(baseMod ?? modData),
        downloadedAt: baseMod?.downloadedAt ?? now,
        status: ModStatus.Installed,
        installedVpks: installedMod.installedVpks,
        installedFileTree: installedMod.fileTree,
        installOrder: installOrder ?? baseMod?.installOrder,
      };

      if (existingProfileIndex === undefined) {
        profileIndexesByRemoteId.set(
          installedMod.modId,
          nextProfileMods.length,
        );
        nextProfileMods.push(nextMod);
      } else {
        nextProfileMods[existingProfileIndex] = nextMod;
      }

      nextEnabledMods[installedMod.modId] = {
        remoteId: installedMod.modId,
        enabled: true,
        lastModified: now,
      };

      if (updateActiveLocalMods && localIndexesByRemoteId) {
        if (existingLocalIndex === undefined) {
          localIndexesByRemoteId.set(installedMod.modId, nextLocalMods.length);
          nextLocalMods.push(nextMod);
        } else {
          nextLocalMods[existingLocalIndex] = nextMod;
        }
      }
    }

    const nextState: Partial<ReturnType<typeof usePersistedStore.getState>> = {
      profiles: {
        ...state.profiles,
        [profileId]: {
          ...profile,
          enabledMods: nextEnabledMods,
          mods: sortModsByInstallOrder(nextProfileMods),
        },
      },
    };

    if (updateActiveLocalMods) {
      nextState.localMods = sortModsByInstallOrder(nextLocalMods);
    }

    return nextState;
  });
};

const applyReorderedProfileVpksToState = (
  profileId: ProfileId,
  updatedVpkMappings: Array<[string, string[]]>,
) => {
  if (updatedVpkMappings.length === 0) {
    return;
  }

  usePersistedStore.setState((state) => {
    const profile = state.profiles[profileId];

    if (!profile) {
      return state;
    }

    const nextState: Partial<ReturnType<typeof usePersistedStore.getState>> = {
      profiles: {
        ...state.profiles,
        [profileId]: {
          ...profile,
          mods: applyUpdatedVpkMappings(profile.mods, updatedVpkMappings),
        },
      },
    };

    if (state.activeProfileId === profileId) {
      nextState.localMods = applyUpdatedVpkMappings(
        state.localMods,
        updatedVpkMappings,
      );
    }

    return nextState;
  });
};

const restoreProfileLoadOrder = async (profileId: ProfileId): Promise<void> => {
  const profile = usePersistedStore.getState().getProfile(profileId);

  if (!profile) {
    return;
  }

  const modOrderData = buildProfileReorderData(profile.mods);

  if (modOrderData.length === 0) {
    return;
  }

  logger
    .withMetadata({
      profileId,
      profileFolder: profile.folderName,
      modCount: modOrderData.length,
    })
    .info("Reasserting profile load order after import retry");

  const updatedVpkMappings = await invoke<Array<[string, string[]]>>(
    "reorder_mods_by_remote_id",
    {
      modOrderData,
      profileFolder: profile.folderName ?? null,
    },
  );

  applyReorderedProfileVpksToState(profileId, updatedVpkMappings);
};

export const useProfileImport = (options?: { listenToProgress?: boolean }) => {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const { t } = useTranslation();
  const { getActiveProfile } = usePersistedStore();
  const listenToProgress = options?.listenToProgress ?? true;

  // Listen to profile import progress events
  useEffect(() => {
    if (!listenToProgress) {
      return;
    }

    const unlistenPromise = listen<ProfileImportProgressEvent>(
      "profile-import-progress",
      (event) => {
        const progress = event.payload;
        setImportProgress({
          currentStep: progress.currentStep,
          currentMod: progress.currentModName || undefined,
          completedMods: progress.currentModIndex,
          totalMods: progress.totalMods,
          isDownloading: progress.currentStep === "downloading",
          isInstalling: progress.currentStep === "installing",
        });
      },
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [listenToProgress]);

  const createProfileFromImport = async (
    importedProfile: SharedProfile,
    modsData: ModDto[],
    options?: ProfileImportOptions,
  ): Promise<void> => {
    const {
      importedMods,
      availableImportedMods,
      installOrderByRemoteId,
      modsDataByRemoteId,
      unavailableModsCount,
    } = resolveImportContext(importedProfile, modsData);

    const totalImportedMods = importedMods.length;
    if (totalImportedMods === 0) {
      throw new Error("No mods available in imported profile");
    }

    logger
      .withMetadata({
        importedModsCount: totalImportedMods,
        availableModsCount: availableImportedMods.length,
        unavailableModsCount,
      })
      .info("Starting profile import");

    let newProfileId: ProfileId | null = null;

    try {
      setImportProgress({
        currentStep: t("profiles.creatingProfile"),
        completedMods: 0,
        totalMods: totalImportedMods,
        isDownloading: false,
        isInstalling: false,
      });

      const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const createdProfileId = createProfileId(profileId);
      newProfileId = createdProfileId;
      const profileName = createImportedProfileName();
      const folderName = await createProfileFolder(
        createdProfileId,
        profileName,
      );

      const newProfile: ModProfile = {
        id: createdProfileId,
        name: profileName,
        description: IMPORTED_PROFILE_DESCRIPTION,
        createdAt: new Date(),
        lastUsed: new Date(),
        enabledMods: {},
        isDefault: false,
        folderName,
        mods: [],
        importMetadata: createImportMetadata(
          importedProfile,
          options?.sourceProfileId,
        ),
      };

      usePersistedStore.setState((state) => ({
        profiles: {
          ...state.profiles,
          [createdProfileId]: newProfile,
        },
      }));

      const { preparedMods, failed: preparationFailed } =
        await prepareProfileImportMods(availableImportedMods);

      let result: ProfileImportResult = {
        profileFolder: folderName,
        succeeded: [],
        failed: [],
        installedMods: [],
      };

      if (preparedMods.length > 0) {
        result = (await invoke("import_profile_batch", {
          profileName,
          profileDescription: IMPORTED_PROFILE_DESCRIPTION,
          profileFolder: folderName,
          mods: preparedMods.map((entry) => entry.profileImportMod),
          importType: "override",
        })) as ProfileImportResult;

        if (result.profileFolder && result.profileFolder !== folderName) {
          setProfileFolderName(newProfileId, result.profileFolder);
        }
      }

      if (result.installedMods.length > 0) {
        applyImportedModsToProfileState(
          newProfileId,
          result.installedMods,
          modsDataByRemoteId,
          installOrderByRemoteId,
        );
      }

      const updatedProfile = usePersistedStore
        .getState()
        .getProfile(newProfileId);
      const missingRemoteIds = updatedProfile
        ? getImportedProfileMissingRemoteIds(updatedProfile)
        : importedMods.map((mod) => mod.remoteId);

      // Clear progress
      setImportProgress(null);

      // Show results
      if (missingRemoteIds.length > 0) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
            unavailable: unavailableModsCount,
            preparationFailed: preparationFailed.length,
            missing: missingRemoteIds.length,
          })
          .warn("Some mods failed to import");
        toast.warning(
          t("profiles.createSuccess", { profileName }) +
            ` (${totalImportedMods - missingRemoteIds.length}/${totalImportedMods} mods imported)`,
        );
      } else {
        toast.success(t("profiles.createSuccess", { profileName }));
      }
    } catch (error) {
      logger.withError(error).error("Profile import failed");
      setImportProgress(null);
      toast.error(t("profiles.createError"));
      throw error;
    }
  };

  const addToCurrentProfile = async (
    importedProfile: SharedProfile,
    modsData: ModDto[],
    options?: ProfileImportOptions,
  ): Promise<void> => {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
      throw new Error("No active profile found");
    }

    const {
      importedMods,
      availableImportedMods,
      installOrderByRemoteId,
      modsDataByRemoteId,
      unavailableModsCount,
    } = resolveImportContext(importedProfile, modsData);

    const totalImportedMods = importedMods.length;
    if (totalImportedMods === 0) {
      throw new Error("No mods available in imported profile");
    }

    logger
      .withMetadata({
        profileId: activeProfile.id,
        importedModsCount: totalImportedMods,
        availableModsCount: availableImportedMods.length,
        unavailableModsCount,
      })
      .info("Overriding current profile with imported mods");

    try {
      setImportProgress({
        currentStep: t("profiles.updatingProfile"),
        completedMods: 0,
        totalMods: totalImportedMods,
        isDownloading: false,
        isInstalling: false,
      });

      persistProfileImportMetadata(
        activeProfile.id,
        importedProfile,
        options?.sourceProfileId,
      );

      const { preparedMods, failed: preparationFailed } =
        await prepareProfileImportMods(availableImportedMods);

      let result: ProfileImportResult = {
        profileFolder: activeProfile.folderName || "",
        succeeded: [],
        failed: [],
        installedMods: [],
      };

      if (preparedMods.length > 0) {
        result = (await invoke("import_profile_batch", {
          profileName: activeProfile.name,
          profileDescription: activeProfile.description || "",
          profileFolder: activeProfile.folderName || "",
          mods: preparedMods.map((entry) => entry.profileImportMod),
          importType: "override",
        })) as ProfileImportResult;

        applyImportedModsToProfileState(
          activeProfile.id,
          result.installedMods,
          modsDataByRemoteId,
          installOrderByRemoteId,
        );
      }

      const updatedProfile = usePersistedStore
        .getState()
        .getProfile(activeProfile.id);
      const missingRemoteIds = updatedProfile
        ? getImportedProfileMissingRemoteIds(updatedProfile)
        : importedMods.map((mod) => mod.remoteId);

      // Clear progress
      setImportProgress(null);

      // Show results
      if (missingRemoteIds.length > 0) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
            unavailable: unavailableModsCount,
            preparationFailed: preparationFailed.length,
            missing: missingRemoteIds.length,
          })
          .warn("Some mods failed to import to current profile");
        toast.warning(
          t("profiles.overrideSuccess") +
            ` (${totalImportedMods - missingRemoteIds.length}/${totalImportedMods} mods imported)`,
        );
      } else {
        toast.success(t("profiles.overrideSuccess"));
      }
    } catch (error) {
      logger.withError(error).error("Profile import failed");
      setImportProgress(null);
      toast.error(t("profiles.updateError"));
      throw error;
    }
  };

  const retryImportedProfile = async (
    profileId: ProfileId,
  ): Promise<RetryProfileImportResult> => {
    const profile = usePersistedStore.getState().getProfile(profileId);

    if (!profile?.importMetadata) {
      throw new Error("Profile does not have import recovery metadata");
    }

    const retryProfile = buildImportedProfileRetryPayload(profile);
    if (!retryProfile) {
      return {
        attemptedCount: 0,
        recoveredCount: 0,
        remainingCount: 0,
      };
    }

    const missingRemoteIds = getImportedProfileMissingRemoteIds(profile);
    const installOrderByRemoteId = new Map(
      getOrderedSharedProfileMods(profile.importMetadata.sharedProfile).map(
        (mod, index) => [mod.remoteId, index],
      ),
    );

    logger
      .withMetadata({
        profileId,
        missingRemoteIds,
        sourceProfileId: profile.importMetadata.sourceProfileId,
      })
      .info("Retrying imported profile recovery");

    const { modsData, failed: modLookupFailed } =
      await fetchModsData(missingRemoteIds);
    const { availableImportedMods, modsDataByRemoteId } = resolveImportContext(
      retryProfile,
      modsData,
    );
    const { preparedMods, failed: preparationFailed } =
      await prepareProfileImportMods(availableImportedMods);

    let result: ProfileImportResult = {
      profileFolder: profile.folderName || "",
      succeeded: [],
      failed: [],
      installedMods: [],
    };

    if (preparedMods.length > 0) {
      result = (await invoke("import_profile_batch", {
        profileName: profile.name,
        profileDescription: profile.description || "",
        profileFolder: profile.folderName || "",
        mods: preparedMods.map((entry) => entry.profileImportMod),
        importType: "override",
        skipReorder: true,
      })) as ProfileImportResult;

      applyImportedModsToProfileState(
        profileId,
        result.installedMods,
        modsDataByRemoteId,
        installOrderByRemoteId,
      );

      await restoreProfileLoadOrder(profileId);
    }

    const updatedProfile = usePersistedStore.getState().getProfile(profileId);
    const remainingCount = updatedProfile
      ? getImportedProfileMissingRemoteIds(updatedProfile).length
      : missingRemoteIds.length;
    const recoveredCount = missingRemoteIds.length - remainingCount;

    logger
      .withMetadata({
        profileId,
        attemptedCount: missingRemoteIds.length,
        recoveredCount,
        remainingCount,
        modLookupFailed: modLookupFailed.length,
        preparationFailed: preparationFailed.length,
        importFailed: result.failed.length,
      })
      .info("Completed imported profile recovery retry");

    return {
      attemptedCount: missingRemoteIds.length,
      recoveredCount,
      remainingCount,
    };
  };

  return {
    createProfileFromImport,
    addToCurrentProfile,
    importProgress,
    retryImportedProfile,
  };
};
