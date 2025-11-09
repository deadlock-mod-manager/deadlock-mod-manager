import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { useState } from "react";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type {
  InstallableMod,
  LocalMod,
  LocalModWithFiles,
  ModFileTree,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";

const logger = createLogger("install-with-collection");

export type InstallWithCollectionOptions = {
  onStart: (mod: LocalMod) => void;
  onComplete: (mod: LocalMod, result: InstallableMod) => void;
  onError: (mod: LocalMod, error: ErrorKind) => void;
  onCancel?: (mod: LocalMod) => void;
  onFileTreeAnalyzed?: (mod: LocalMod, fileTree: ModFileTree) => void;
};

export type InstallWithCollectionFunction = (
  mod: LocalMod,
  options: InstallWithCollectionOptions,
  preselectedFileTree?: ModFileTree,
) => Promise<InstallableMod | null>;

export type UseInstallWithCollectionReturn = {
  install: InstallWithCollectionFunction;
  isAnalyzing: boolean;
  currentFileTree: ModFileTree | null;
  showFileSelector: boolean;
  setShowFileSelector: (show: boolean) => void;
  confirmInstallation: (fileTree: ModFileTree) => Promise<void>;
  cancelInstallation: () => void;
  currentMod: LocalMod | null;
  currentOptions: InstallWithCollectionOptions | null;
};

const useInstallWithCollection = (): UseInstallWithCollectionReturn => {
  const { getActiveProfile } = usePersistedStore();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentFileTree, setCurrentFileTree] = useState<ModFileTree | null>(
    null,
  );
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [currentMod, setCurrentMod] = useState<LocalMod | null>(null);
  const [currentOptions, setCurrentOptions] =
    useState<InstallWithCollectionOptions | null>(null);

  const performInstallation = async (
    mod: LocalMod,
    options: InstallWithCollectionOptions,
    fileTree?: ModFileTree,
  ): Promise<InstallableMod | null> => {
    try {
      logger.info("Performing installation", {
        modId: mod.remoteId,
        hasFileTree: !!fileTree,
        selectedFiles: fileTree?.files.filter((f) => f.is_selected).length,
      });

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      // If file tree is provided and mod was downloaded with multiple files,
      // we need to copy selected VPKs from archive first
      if (fileTree?.has_multiple_files) {
        logger.info("Copying selected VPKs from archive", {
          modId: mod.remoteId,
          selectedFiles: fileTree.files.filter((f) => f.is_selected).length,
        });

        try {
          await invoke("copy_selected_vpks_from_archive", {
            modId: mod.remoteId,
            fileTree,
            profileFolder,
          });
        } catch (error: unknown) {
          logger.error("Failed to copy selected VPKs", {
            modId: mod.remoteId,
            error,
          });
          // If copying fails, try to proceed anyway (maybe VPKs already exist)
          // This handles edge cases where archive was already processed
        }
      }

      const modData: LocalModWithFiles = {
        ...mod,
        file_tree: fileTree,
      };

      const result = (await invoke("install_mod", {
        deadlockMod: {
          id: modData.remoteId,
          name: modData.name,
          file_tree: modData.file_tree,
        },
        profileFolder,
      })) as InstallableMod;

      options.onComplete(mod, result);
      return result;
    } catch (error: unknown) {
      logger.error("Installation failed", { modId: mod.remoteId, error });

      if (error instanceof Error) {
        options.onError(mod, {
          kind: "unknown",
          message: error.message,
        });
      } else if (
        typeof error === "object" &&
        error !== null &&
        "kind" in error
      ) {
        options.onError(mod, error as ErrorKind);
      }
      return null;
    }
  };

  const install: InstallWithCollectionFunction = async (
    mod,
    options,
    preselectedFileTree,
  ) => {
    try {
      options.onStart(mod);

      if (mod.status === ModStatus.Installed) {
        throw new Error("Mod is already installed!");
      }

      // If a preselected file tree was provided, use it directly
      if (preselectedFileTree) {
        logger.info("Using preselected file tree", {
          modId: mod.remoteId,
          selectedFiles: preselectedFileTree.files.filter((f) => f.is_selected)
            .length,
        });

        return await performInstallation(mod, options, preselectedFileTree);
      }

      // Check if file tree was stored during download
      if (mod.installedFileTree) {
        logger.info("Using stored file tree from download", {
          modId: mod.remoteId,
          totalFiles: mod.installedFileTree.total_files,
          hasMultipleFiles: mod.installedFileTree.has_multiple_files,
          hasInstalledVpks: !!mod.installedVpks?.length,
        });

        // Call onFileTreeAnalyzed callback if provided
        options.onFileTreeAnalyzed?.(mod, mod.installedFileTree);

        // If mod has multiple files, check if we already have a previous selection
        if (mod.installedFileTree.has_multiple_files) {
          // If mod already has installedVpks, it means user previously selected files
          // Use that selection instead of prompting again
          if (mod.installedVpks && mod.installedVpks.length > 0) {
            logger.info(
              "Mod has previous VPK selection, using it for re-enable",
              {
                modId: mod.remoteId,
                previouslyInstalledVpks: mod.installedVpks.length,
              },
            );

            // Create a new file tree with only previously selected files marked as selected
            const previouslySelectedFiles = new Set(
              mod.installedVpks.map((vpkPath) => {
                // Extract the original filename from the path
                const filename = vpkPath.split(/[\\/]/).pop() || "";
                // Remove the mod prefix if present (e.g., "modId_file.vpk" -> "file.vpk")
                return filename.replace(new RegExp(`^${mod.remoteId}_`), "");
              }),
            );

            const updatedFileTree: ModFileTree = {
              ...mod.installedFileTree,
              files: mod.installedFileTree.files.map((file) => ({
                ...file,
                is_selected: previouslySelectedFiles.has(file.name),
              })),
            };

            logger.info("Using previous VPK selection for re-enable", {
              modId: mod.remoteId,
              selectedFiles: updatedFileTree.files.filter((f) => f.is_selected)
                .length,
              totalFiles: updatedFileTree.total_files,
            });

            return await performInstallation(mod, options, updatedFileTree);
          }

          // No previous selection - show file selector dialog
          logger.info("Mod has multiple files, showing file selector dialog", {
            modId: mod.remoteId,
            totalFiles: mod.installedFileTree.total_files,
          });

          // Store mod and options for dialog callbacks
          setCurrentMod(mod);
          setCurrentOptions(options);
          setCurrentFileTree(mod.installedFileTree);
          setShowFileSelector(true);
          setIsAnalyzing(false);

          // Return null - installation will proceed after user confirms selection
          return null;
        }

        // Single file - proceed with installation directly
        logger.info(
          "Mod has single file or no files, proceeding with installation",
          {
            modId: mod.remoteId,
            totalFiles: mod.installedFileTree.total_files,
          },
        );

        return await performInstallation(mod, options, mod.installedFileTree);
      }

      // Analyze file tree to check for multiple VPK files
      setIsAnalyzing(true);
      let fileTree: ModFileTree | null = null;

      try {
        // Construct mod directory path
        const base = await appLocalDataDir();
        const modsRoot = await join(base, "mods");
        const modDir = await join(modsRoot, mod.remoteId);

        logger.info("Analyzing mod file tree", {
          modId: mod.remoteId,
          modPath: modDir,
        });

        // Get file tree from backend
        fileTree = (await invoke("get_mod_file_tree", {
          modPath: modDir,
        })) as ModFileTree;

        logger.info("File tree analysis complete", {
          modId: mod.remoteId,
          totalFiles: fileTree.total_files,
          hasMultipleFiles: fileTree.has_multiple_files,
        });

        // Call onFileTreeAnalyzed callback if provided
        options.onFileTreeAnalyzed?.(mod, fileTree);

        // If mod has multiple files, show file selector dialog
        if (fileTree.has_multiple_files) {
          logger.info("Mod has multiple files, showing file selector dialog", {
            modId: mod.remoteId,
            totalFiles: fileTree.total_files,
          });

          // Store mod and options for dialog callbacks
          setCurrentMod(mod);
          setCurrentOptions(options);
          setCurrentFileTree(fileTree);
          setShowFileSelector(true);
          setIsAnalyzing(false);

          // Return null - installation will proceed after user confirms selection
          return null;
        }

        // Single file or no files - proceed with installation directly
        logger.info(
          "Mod has single file or no files, proceeding with installation",
          {
            modId: mod.remoteId,
            totalFiles: fileTree.total_files,
          },
        );

        setIsAnalyzing(false);
        return await performInstallation(mod, options, fileTree);
      } catch (error: unknown) {
        setIsAnalyzing(false);
        logger.warn(
          "File tree analysis failed, proceeding with direct installation",
          {
            modId: mod.remoteId,
            error,
          },
        );

        // If analysis fails, proceed with installation without file tree
        // This handles cases where mod directory doesn't exist or analysis fails
        return await performInstallation(mod, options);
      }
    } catch (error: unknown) {
      setIsAnalyzing(false);
      logger.error("Installation process failed", {
        modId: mod.remoteId,
        error,
      });

      if (error instanceof Error) {
        options.onError(mod, {
          kind: "unknown",
          message: error.message,
        });
      } else if (
        typeof error === "object" &&
        error !== null &&
        "kind" in error
      ) {
        options.onError(mod, error as ErrorKind);
      }
      return null;
    }
  };

  const confirmInstallation = async (fileTree: ModFileTree): Promise<void> => {
    if (!currentMod) {
      logger.error("No current mod for installation confirmation");
      return;
    }

    if (!currentOptions) {
      logger.error("No current options for installation confirmation");
      return;
    }

    logger.info("User confirmed installation", {
      modId: currentMod.remoteId,
      selectedFiles: fileTree.files.filter((f) => f.is_selected).length,
    });

    setShowFileSelector(false);

    try {
      await performInstallation(currentMod, currentOptions, fileTree);
    } finally {
      // Clean up state
      setCurrentMod(null);
      setCurrentOptions(null);
      setCurrentFileTree(null);
    }
  };

  const cancelInstallation = (): void => {
    if (currentMod && currentOptions) {
      logger.info("User canceled installation", { modId: currentMod.remoteId });

      // Call onCancel callback to revert mod status
      currentOptions.onCancel?.(currentMod);
    }

    setShowFileSelector(false);
    setCurrentMod(null);
    setCurrentOptions(null);
    setCurrentFileTree(null);
  };

  return {
    install,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    setShowFileSelector,
    confirmInstallation,
    cancelInstallation,
    currentMod,
    currentOptions,
  };
};

export default useInstallWithCollection;
