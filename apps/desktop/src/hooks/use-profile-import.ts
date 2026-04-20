import {
  getOrderedSharedProfileMods,
  type ModDto,
  type ProfileModDownload,
  type SharedProfile,
} from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getModDownloads } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type {
  LocalMod,
  ProfileImportMod,
  ProfileImportProgressEvent,
  ProfileImportResult,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type { ModProfile } from "@/types/profiles";
import { createProfileId } from "@/types/profiles";

export interface ImportProgress {
  currentStep: string;
  currentMod?: string;
  completedMods: number;
  totalMods: number;
  isDownloading: boolean;
  isInstalling: boolean;
}

const resolveSelectedFileNames = (
  selectedDownloads?: ProfileModDownload[],
  selectedDownload?: ProfileModDownload,
): string[] | null =>
  selectedDownloads?.length
    ? selectedDownloads.map((d) => d.file)
    : selectedDownload
      ? [selectedDownload.file]
      : null;

type OrderedImportedMod = ReturnType<
  typeof getOrderedSharedProfileMods
>[number];

interface AvailableImportedMod {
  importedMod: OrderedImportedMod;
  modData: ModDto;
}

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

export const useProfileImport = () => {
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null,
  );
  const { t } = useTranslation();
  const {
    getActiveProfile,
    setModEnabledInProfile,
    setModEnabledInCurrentProfile,
  } = usePersistedStore();
  const { addLocalMod, setInstalledVpks, setModOrder } = usePersistedStore();

  // Listen to profile import progress events
  useEffect(() => {
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
  }, []);

  const createProfileFromImport = async (
    importedProfile: SharedProfile,
    modsData: ModDto[],
  ): Promise<void> => {
    const {
      importedMods,
      availableImportedMods,
      installOrderByRemoteId,
      modsDataByRemoteId,
      unavailableModsCount,
    } = resolveImportContext(importedProfile, modsData);

    logger
      .withMetadata({
        importedModsCount: importedMods.length,
        availableModsCount: availableImportedMods.length,
        unavailableModsCount,
      })
      .info("Starting profile import");

    try {
      if (availableImportedMods.length === 0) {
        throw new Error("No available mods to import");
      }

      setImportProgress({
        currentStep: t("profiles.creatingProfile"),
        completedMods: 0,
        totalMods: availableImportedMods.length,
        isDownloading: false,
        isInstalling: false,
      });

      const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newProfileId = createProfileId(profileId);

      const newProfile: ModProfile = {
        id: newProfileId,
        name: `Imported Profile - ${new Date().toLocaleDateString()}`,
        description: "Profile imported from shared profile ID",
        createdAt: new Date(),
        lastUsed: new Date(),
        enabledMods: {},
        isDefault: false,
        folderName: null,
        mods: [],
      };

      usePersistedStore.setState((state) => ({
        profiles: {
          ...state.profiles,
          [newProfileId]: newProfile,
        },
      }));

      const profileImportMods: ProfileImportMod[] = await Promise.all(
        availableImportedMods.map(async ({ importedMod, modData }) => {
          const downloadsResponse = await getModDownloads(modData.remoteId);
          const downloadFiles = downloadsResponse.downloads || [];

          const selectedFileNames = resolveSelectedFileNames(
            importedMod.selectedDownloads,
            importedMod.selectedDownload,
          );
          const selectedFiles =
            selectedFileNames && downloadFiles.length > 0
              ? downloadFiles.filter((d) => selectedFileNames.includes(d.name))
              : downloadFiles;

          return {
            modId: modData.remoteId,
            modName: modData.name,
            downloadFiles: selectedFiles.map((d) => ({
              url: d.url,
              name: d.name,
              size: d.size || 0,
            })),
            fileTree: importedMod.fileTree
              ? {
                  ...importedMod.fileTree,
                  files: importedMod.fileTree.files.some((f) => f.is_selected)
                    ? importedMod.fileTree.files
                    : importedMod.fileTree.files.map((f) => ({
                        ...f,
                        is_selected: true,
                      })),
                }
              : undefined,
            isMap: modData.isMap,
          };
        }),
      );

      // Call Rust batch import command - it will create the profile folder
      const result = (await invoke("import_profile_batch", {
        profileName: `Imported Profile - ${new Date().toLocaleDateString()}`,
        profileDescription: "Profile imported from shared profile ID",
        profileFolder: "", // Empty - batch import will create it
        mods: profileImportMods,
        importType: "create", // Batch import will create the folder
      })) as ProfileImportResult;

      // Update profile folder name with the one created by batch import
      const currentProfile = usePersistedStore
        .getState()
        .getProfile(newProfileId);
      if (currentProfile && result.profileFolder) {
        usePersistedStore.setState((state) => ({
          profiles: {
            ...state.profiles,
            [newProfileId]: {
              ...currentProfile,
              folderName: result.profileFolder,
            },
          },
        }));
      }

      // Enable mods in the profile and add them to state
      const store = usePersistedStore.getState();
      const newMods: LocalMod[] = [];

      for (const installedModInfo of result.installedMods) {
        const modData = modsDataByRemoteId.get(installedModInfo.modId);

        if (modData) {
          // Check if mod already exists in localMods
          const existingMod = store.localMods.find(
            (m) => m.remoteId === installedModInfo.modId,
          );

          const localMod: LocalMod = existingMod
            ? {
                ...existingMod,
                installedVpks: installedModInfo.installedVpks,
                installedFileTree: installedModInfo.fileTree,
                status: ModStatus.Installed,
                installOrder: installOrderByRemoteId.get(
                  installedModInfo.modId,
                ),
              }
            : {
                ...modData,
                status: ModStatus.Installed,
                installedVpks: installedModInfo.installedVpks,
                installedFileTree: installedModInfo.fileTree,
                downloadedAt: new Date(),
                installOrder: installOrderByRemoteId.get(
                  installedModInfo.modId,
                ),
              };

          if (!existingMod) {
            // Add mod to localMods
            addLocalMod(modData, {
              status: ModStatus.Installed,
              installedVpks: installedModInfo.installedVpks,
              installedFileTree: installedModInfo.fileTree,
              downloadedAt: new Date(),
              installOrder: installOrderByRemoteId.get(installedModInfo.modId),
            });
          } else {
            // Update existing mod with installed VPKs
            setInstalledVpks(
              installedModInfo.modId,
              installedModInfo.installedVpks,
              installedModInfo.fileTree,
            );
          }

          newMods.push(localMod);
        }

        // Enable mod in the profile
        setModEnabledInProfile(newProfileId, installedModInfo.modId, true);
      }

      // Add mods to the new profile's mods array
      if (newMods.length > 0) {
        const orderedNewMods = [...newMods].sort(
          (left, right) =>
            (left.installOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.installOrder ?? Number.MAX_SAFE_INTEGER),
        );
        const profile = usePersistedStore.getState().getProfile(newProfileId);
        if (profile) {
          usePersistedStore.setState((state) => ({
            profiles: {
              ...state.profiles,
              [newProfileId]: {
                ...profile,
                mods: orderedNewMods,
              },
            },
          }));
        }
      }

      // Clear progress
      setImportProgress(null);

      // Show results
      if (result.failed.length > 0 || unavailableModsCount > 0) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
            unavailable: unavailableModsCount,
          })
          .warn("Some mods failed to import");
        toast.warning(
          t("profiles.createSuccess", { profileName: "Imported Profile" }) +
            ` (${result.succeeded.length}/${importedMods.length} mods imported)`,
        );
      } else {
        toast.success(
          t("profiles.createSuccess", { profileName: "Imported Profile" }),
        );
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

    logger
      .withMetadata({
        profileId: activeProfile.id,
        importedModsCount: importedMods.length,
        availableModsCount: availableImportedMods.length,
        unavailableModsCount,
      })
      .info("Overriding current profile with imported mods");

    try {
      if (availableImportedMods.length === 0) {
        throw new Error("No available mods to import");
      }

      setImportProgress({
        currentStep: t("profiles.updatingProfile"),
        completedMods: 0,
        totalMods: availableImportedMods.length,
        isDownloading: false,
        isInstalling: false,
      });

      const profileImportMods: ProfileImportMod[] = await Promise.all(
        availableImportedMods.map(async ({ importedMod, modData }) => {
          const downloadsResponse = await getModDownloads(modData.remoteId);
          const downloadFiles = downloadsResponse.downloads || [];

          const selectedFileNames = resolveSelectedFileNames(
            importedMod.selectedDownloads,
            importedMod.selectedDownload,
          );
          const selectedFiles =
            selectedFileNames && downloadFiles.length > 0
              ? downloadFiles.filter((d) => selectedFileNames.includes(d.name))
              : downloadFiles;

          return {
            modId: modData.remoteId,
            modName: modData.name,
            downloadFiles: selectedFiles.map((d) => ({
              url: d.url,
              name: d.name,
              size: d.size || 0,
            })),
            fileTree: importedMod.fileTree
              ? {
                  ...importedMod.fileTree,
                  files: importedMod.fileTree.files.some((f) => f.is_selected)
                    ? importedMod.fileTree.files
                    : importedMod.fileTree.files.map((f) => ({
                        ...f,
                        is_selected: true,
                      })),
                }
              : undefined,
            isMap: modData.isMap,
          };
        }),
      );

      // Call Rust batch import command
      const result = (await invoke("import_profile_batch", {
        profileName: activeProfile.name,
        profileDescription: activeProfile.description || "",
        profileFolder: activeProfile.folderName || "",
        mods: profileImportMods,
        importType: "override",
      })) as ProfileImportResult;

      // Enable mods in the current profile and add them to state
      for (const installedModInfo of result.installedMods) {
        const modData = modsDataByRemoteId.get(installedModInfo.modId);

        if (modData) {
          // Check if mod already exists in localMods
          const existingMod = usePersistedStore
            .getState()
            .localMods.find((m) => m.remoteId === installedModInfo.modId);

          if (!existingMod) {
            // Add mod to localMods with installed status
            addLocalMod(modData, {
              status: ModStatus.Installed,
              installedVpks: installedModInfo.installedVpks,
              installedFileTree: installedModInfo.fileTree,
              downloadedAt: new Date(),
              installOrder: installOrderByRemoteId.get(installedModInfo.modId),
            });
          } else {
            // Update existing mod with installed VPKs
            setInstalledVpks(
              installedModInfo.modId,
              installedModInfo.installedVpks,
              installedModInfo.fileTree,
            );

            const installOrder = installOrderByRemoteId.get(
              installedModInfo.modId,
            );
            if (installOrder !== undefined) {
              setModOrder(installedModInfo.modId, installOrder);
            }
          }
        }

        // Enable mod in the current profile
        setModEnabledInCurrentProfile(installedModInfo.modId, true);
      }

      // Clear progress
      setImportProgress(null);

      // Show results
      if (result.failed.length > 0 || unavailableModsCount > 0) {
        logger
          .withMetadata({
            failed: result.failed.length,
            succeeded: result.succeeded.length,
            unavailable: unavailableModsCount,
          })
          .warn("Some mods failed to import to current profile");
        toast.warning(
          t("profiles.overrideSuccess") +
            ` (${result.succeeded.length}/${importedMods.length} mods imported)`,
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

  return {
    createProfileFromImport,
    addToCurrentProfile,
    importProgress,
  };
};
