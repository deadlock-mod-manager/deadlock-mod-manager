import type { ModDto } from "@deadlock-mods/shared";
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
  ModFileTree,
  ProfileImportMod,
  ProfileImportProgressEvent,
  ProfileImportResult,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type { ModProfile, ProfileId } from "@/types/profiles";
import { createProfileId } from "@/types/profiles";

export interface ImportProgress {
  currentStep: string;
  currentMod?: string;
  completedMods: number;
  totalMods: number;
  isDownloading: boolean;
  isInstalling: boolean;
}

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
  const { addLocalMod, setInstalledVpks } = usePersistedStore();

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
    importedMods: Array<{
      remoteId: string;
      fileTree?: ModFileTree;
      selectedDownload?: {
        remoteId: string;
        file: string;
        url: string;
        size: number;
      };
    }>,
    modsData: ModDto[],
  ): Promise<void> => {
    logger.info("Starting profile import", {
      importedModsCount: importedMods.length,
      modsDataCount: modsData.length,
    });

    // Initialize progress tracking
    setImportProgress({
      currentStep: t("profiles.creatingProfile"),
      completedMods: 0,
      totalMods: importedMods.length,
      isDownloading: false,
      isInstalling: false,
    });

    // Create new profile in store without creating folder (batch import will create it)
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newProfileId = createProfileId(profileId) as ProfileId;

    const newProfile: ModProfile = {
      id: newProfileId,
      name: `Imported Profile - ${new Date().toLocaleDateString()}`,
      description: "Profile imported from shared profile ID",
      createdAt: new Date(),
      lastUsed: new Date(),
      enabledMods: {},
      isDefault: false,
      folderName: null, // Will be set after batch import creates the folder
      mods: [],
    };

    usePersistedStore.setState((state) => ({
      profiles: {
        ...state.profiles,
        [newProfileId]: newProfile,
      },
    }));

    // Prepare mods for batch import
    const profileImportMods: ProfileImportMod[] = await Promise.all(
      importedMods.map(async (importedMod) => {
        const modData = modsData.find(
          (m) => m.remoteId === importedMod.remoteId,
        );

        if (!modData) {
          throw new Error(`Mod ${importedMod.remoteId} not available`);
        }

        // Fetch downloads for this mod
        const downloadsResponse = await getModDownloads(modData.remoteId);
        const downloadFiles = downloadsResponse.downloads || [];

        // Use selectedDownload if available, otherwise use all downloads
        const selectedFiles =
          importedMod.selectedDownload && downloadFiles.length > 0
            ? downloadFiles.filter(
                (d) => d.name === importedMod.selectedDownload!.file,
              )
            : downloadFiles;

        return {
          modId: modData.remoteId,
          modName: modData.name,
          downloadFiles: selectedFiles.map((d) => ({
            url: d.url,
            name: d.name,
            size: d.size || 0,
          })),
          fileTree: importedMod.fileTree,
        };
      }),
    );

    try {
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
        const profiles = usePersistedStore.getState().profiles;
        profiles[newProfileId] = {
          ...currentProfile,
          folderName: result.profileFolder,
        };
        usePersistedStore.setState({ profiles });
      }

      // Enable mods in the profile and add them to state
      const store = usePersistedStore.getState();
      const newMods: LocalMod[] = [];

      for (const installedModInfo of result.installedMods) {
        // Find the mod data from the original modsData
        const modData = modsData.find(
          (m) => m.remoteId === installedModInfo.modId,
        );

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
              }
            : {
                ...modData,
                status: ModStatus.Installed,
                installedVpks: installedModInfo.installedVpks,
                installedFileTree: installedModInfo.fileTree,
                downloadedAt: new Date(),
              };

          if (!existingMod) {
            // Add mod to localMods
            addLocalMod(modData, {
              status: ModStatus.Installed,
              installedVpks: installedModInfo.installedVpks,
              installedFileTree: installedModInfo.fileTree,
              downloadedAt: new Date(),
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
        const profile = usePersistedStore.getState().getProfile(newProfileId);
        if (profile) {
          const profiles = usePersistedStore.getState().profiles;
          profiles[newProfileId] = {
            ...profile,
            mods: [...profile.mods, ...newMods],
          };
          usePersistedStore.setState({ profiles });
        }
      }

      // Clear progress
      setImportProgress(null);

      // Show results
      if (result.failed.length > 0) {
        logger.warn("Some mods failed to import", {
          failed: result.failed.length,
          succeeded: result.succeeded.length,
        });
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
      logger.error("Profile import failed", { error });
      setImportProgress(null);
      toast.error(t("profiles.createError"));
      throw error;
    }
  };

  const addToCurrentProfile = async (
    importedMods: Array<{
      remoteId: string;
      fileTree?: ModFileTree;
      selectedDownload?: {
        remoteId: string;
        file: string;
        url: string;
        size: number;
      };
    }>,
    modsData: ModDto[],
  ): Promise<void> => {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
      throw new Error("No active profile found");
    }

    // Initialize progress tracking
    setImportProgress({
      currentStep: t("profiles.updatingProfile"),
      completedMods: 0,
      totalMods: importedMods.length,
      isDownloading: false,
      isInstalling: false,
    });

    logger.info("Overriding current profile with imported mods", {
      profileId: activeProfile.id,
    });

    // Prepare mods for batch import
    const profileImportMods: ProfileImportMod[] = await Promise.all(
      importedMods.map(async (importedMod) => {
        const modData = modsData.find(
          (m) => m.remoteId === importedMod.remoteId,
        );

        if (!modData) {
          throw new Error(`Mod ${importedMod.remoteId} not available`);
        }

        // Fetch downloads for this mod
        const downloadsResponse = await getModDownloads(modData.remoteId);
        const downloadFiles = downloadsResponse.downloads || [];

        // Use selectedDownload if available, otherwise use all downloads
        const selectedFiles =
          importedMod.selectedDownload && downloadFiles.length > 0
            ? downloadFiles.filter(
                (d) => d.name === importedMod.selectedDownload!.file,
              )
            : downloadFiles;

        return {
          modId: modData.remoteId,
          modName: modData.name,
          downloadFiles: selectedFiles.map((d) => ({
            url: d.url,
            name: d.name,
            size: d.size || 0,
          })),
          fileTree: importedMod.fileTree,
        };
      }),
    );

    try {
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
        // Find the mod data from the original modsData
        const modData = modsData.find(
          (m) => m.remoteId === installedModInfo.modId,
        );

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
            });
          } else {
            // Update existing mod with installed VPKs
            setInstalledVpks(
              installedModInfo.modId,
              installedModInfo.installedVpks,
              installedModInfo.fileTree,
            );
          }
        }

        // Enable mod in the current profile
        setModEnabledInCurrentProfile(installedModInfo.modId, true);
      }

      // Clear progress
      setImportProgress(null);

      // Show results
      if (result.failed.length > 0) {
        logger.warn("Some mods failed to import to current profile", {
          failed: result.failed.length,
          succeeded: result.succeeded.length,
        });
        toast.warning(
          t("profiles.overrideSuccess") +
            ` (${result.succeeded.length}/${importedMods.length} mods imported)`,
        );
      } else {
        toast.success(t("profiles.overrideSuccess"));
      }
    } catch (error) {
      logger.error("Profile import failed", { error });
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
