import type { ModDto } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, type ModFileTree, ModStatus } from "@/types/mods";
import useInstallWithCollection from "./use-install-with-collection";

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
    createProfile,
    setModEnabledInProfile,
    setModEnabledInCurrentProfile,
    getActiveProfile,
    addLocalMod,
    setModStatus,
    setModPath,
    setModProgress,
    setInstalledVpks,
    localMods,
  } = usePersistedStore();
  const { install } = useInstallWithCollection();

  const processModForImport = async (
    mod: ModDto,
    preselectedFileTree?: ModFileTree,
  ): Promise<void> => {
    logger.info("Processing mod for import", {
      modId: mod.remoteId,
      name: mod.name,
      hasPreselectedFileTree: !!preselectedFileTree,
    });

    // Check if mod is already installed locally
    const existingMod = localMods.find((m) => m.remoteId === mod.remoteId);
    if (existingMod && existingMod.status === ModStatus.Installed) {
      logger.info("Mod already installed, skipping", {
        modId: mod.remoteId,
      });
      return;
    }

    // Step 1: Download the mod if needed
    let modToInstall: LocalMod;

    if (!existingMod || existingMod.status !== ModStatus.Downloaded) {
      setImportProgress((prev) =>
        prev
          ? {
              ...prev,
              currentMod: mod.name,
              isDownloading: true,
              isInstalling: false,
            }
          : null,
      );

      const downloadedPath = await new Promise<string>((resolve, reject) => {
        // Add mod to local store first
        addLocalMod(mod);

        downloadManager.addToQueue({
          ...mod,
          onStart: () => {
            logger.info("Download started for import", { mod: mod.remoteId });
            setModStatus(mod.remoteId, ModStatus.Downloading);
          },
          onProgress: (progress) => {
            setModProgress(mod.remoteId, progress);
          },
          onComplete: (path) => {
            logger.info("Download completed for import", {
              mod: mod.remoteId,
              path,
            });
            setModStatus(mod.remoteId, ModStatus.Downloaded);
            setModPath(mod.remoteId, path);
            resolve(path);
          },
          onError: (error) => {
            logger.error("Download failed for import", {
              mod: mod.remoteId,
              error,
            });
            setModStatus(mod.remoteId, ModStatus.FailedToDownload);
            reject(error);
          },
        });
      });

      // Create the mod object directly from the download result
      modToInstall = {
        ...mod,
        status: ModStatus.Downloaded,
        path: downloadedPath,
        downloadedAt: new Date(),
      };

      logger.info("Created mod object for installation", {
        modId: mod.remoteId,
        path: downloadedPath,
      });
    } else {
      // Use existing mod
      modToInstall = existingMod;
      logger.info("Using existing downloaded mod", {
        modId: mod.remoteId,
        path: existingMod.path,
      });
    }

    // Step 2: Install the mod
    setImportProgress((prev) =>
      prev
        ? {
            ...prev,
            currentMod: mod.name,
            isDownloading: false,
            isInstalling: true,
          }
        : null,
    );

    await new Promise<void>((resolve, reject) => {
      install(
        modToInstall,
        {
          onStart: (mod) => {
            logger.info("Installation started for import", {
              mod: mod.remoteId,
            });
            setModStatus(mod.remoteId, ModStatus.Installing);
          },
          onComplete: (mod, result) => {
            logger.info("Installation completed for import", {
              mod: mod.remoteId,
              installedVpks: result.installed_vpks,
            });
            setModStatus(mod.remoteId, ModStatus.Installed);
            setInstalledVpks(
              mod.remoteId,
              result.installed_vpks,
              result.file_tree,
            );
            resolve();
          },
          onError: (mod, error) => {
            logger.error("Installation failed for import", {
              mod: mod.remoteId,
              error: error.message,
            });
            setModStatus(mod.remoteId, ModStatus.Error);
            reject(new Error(error.message));
          },
          onCancel: (mod) => {
            logger.info("Installation cancelled for import", {
              mod: mod.remoteId,
            });
            setModStatus(mod.remoteId, ModStatus.Downloaded);
            reject(new Error("Installation cancelled"));
          },
        },
        preselectedFileTree, // Pass the preselected file tree
      );
    });
  };

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
      importedMods: importedMods.map((mod) => ({
        remoteId: mod.remoteId,
        hasFileTree: !!mod.fileTree,
        hasSelectedDownload: !!mod.selectedDownload,
      })),
    });
    // Initialize progress tracking
    setImportProgress({
      currentStep: t("profiles.creatingProfile"),
      completedMods: 0,
      totalMods: importedMods.length,
      isDownloading: false,
      isInstalling: false,
    });

    // Create new profile
    const newProfileId = createProfile(
      `Imported Profile - ${new Date().toLocaleDateString()}`,
      "Profile imported from shared profile ID",
    );

    logger.info("Created new profile for import", {
      profileId: newProfileId,
    });

    setImportProgress((prev) =>
      prev
        ? {
            ...prev,
            currentStep: t("profiles.processingMods"),
          }
        : null,
    );

    // Process each mod in the imported profile sequentially
    const importResults: PromiseSettledResult<void>[] = [];
    let completedCount = 0;

    for (const importedMod of importedMods) {
      try {
        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                completedMods: completedCount,
              }
            : null,
        );

        // Find the mod data for this imported mod
        const modData = modsData.find(
          (m) => m.remoteId === importedMod.remoteId,
        );

        if (!modData) {
          logger.warn("Mod data not available", {
            modId: importedMod.remoteId,
          });
          throw new Error(`Mod ${importedMod.remoteId} not available`);
        }

        // Process the mod (download and install if needed)
        await processModForImport(modData, importedMod.fileTree);

        // Enable the mod in the new profile
        setModEnabledInProfile(newProfileId, importedMod.remoteId, true);

        logger.info("Successfully processed mod for new profile", {
          modId: importedMod.remoteId,
          profileId: newProfileId,
        });

        importResults.push({ status: "fulfilled", value: undefined });
        completedCount++;

        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                completedMods: completedCount,
                currentMod: undefined,
                isDownloading: false,
                isInstalling: false,
              }
            : null,
        );
      } catch (error) {
        logger.error("Failed to process mod for import", {
          modId: importedMod.remoteId,
          error,
        });
        importResults.push({ status: "rejected", reason: error });
        completedCount++;
      }
    }

    // Clear progress
    setImportProgress(null);

    // Check results and show appropriate feedback
    const failed = importResults.filter(
      (result) => result.status === "rejected",
    );
    const succeeded = importResults.filter(
      (result) => result.status === "fulfilled",
    );

    if (failed.length > 0) {
      logger.warn("Some mods failed to import", {
        failed: failed.length,
        succeeded: succeeded.length,
      });
      toast.warning(
        t("profiles.createSuccess", { profileName: "Imported Profile" }) +
          ` (${succeeded.length}/${importResults.length} mods imported)`,
      );
    } else {
      toast.success(
        t("profiles.createSuccess", { profileName: "Imported Profile" }),
      );
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

    // Process each mod in the imported profile sequentially
    const importResults: PromiseSettledResult<void>[] = [];
    let completedCount = 0;

    for (const importedMod of importedMods) {
      try {
        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                completedMods: completedCount,
              }
            : null,
        );

        // Find the mod data for this imported mod
        const modData = modsData.find(
          (m) => m.remoteId === importedMod.remoteId,
        );

        if (!modData) {
          logger.warn("Mod data not available", {
            modId: importedMod.remoteId,
          });
          throw new Error(`Mod ${importedMod.remoteId} not available`);
        }

        // Process the mod (download and install if needed)
        await processModForImport(modData, importedMod.fileTree);

        // Enable the mod in the current profile
        setModEnabledInCurrentProfile(importedMod.remoteId, true);

        logger.info("Successfully processed mod for current profile", {
          modId: importedMod.remoteId,
        });

        importResults.push({ status: "fulfilled", value: undefined });
        completedCount++;

        setImportProgress((prev) =>
          prev
            ? {
                ...prev,
                completedMods: completedCount,
                currentMod: undefined,
                isDownloading: false,
                isInstalling: false,
              }
            : null,
        );
      } catch (error) {
        logger.error("Failed to process mod for current profile", {
          modId: importedMod.remoteId,
          error,
        });
        importResults.push({ status: "rejected", reason: error });
        completedCount++;
      }
    }

    // Clear progress
    setImportProgress(null);

    // Check results and show appropriate feedback
    const failed = importResults.filter(
      (result) => result.status === "rejected",
    );
    const succeeded = importResults.filter(
      (result) => result.status === "fulfilled",
    );

    if (failed.length > 0) {
      logger.warn("Some mods failed to import to current profile", {
        failed: failed.length,
        succeeded: succeeded.length,
      });
      toast.warning(
        t("profiles.overrideSuccess") +
          ` (${succeeded.length}/${importResults.length} mods imported)`,
      );
    } else {
      toast.success(t("profiles.overrideSuccess"));
    }
  };

  return {
    createProfileFromImport,
    addToCurrentProfile,
    importProgress,
  };
};
