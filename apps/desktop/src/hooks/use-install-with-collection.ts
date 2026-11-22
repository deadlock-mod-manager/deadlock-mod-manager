import { useState } from "react";
import { useModelConflictInstall } from "@/hooks/use-model-conflict-install";
import { createLogger } from "@/lib/logger";
import {
  applyDownloadTimeSelection,
  previousInstallSelection,
  requiresFileSelection,
} from "@/lib/mods/mod-variants";
import { trackInstallOptions } from "@/lib/analytics";
import { readModFileTree } from "@/lib/mods/read-mod-file-tree";
import type { InstallAnalyticsOptions } from "@/lib/analytics/install";
import { getErrorMessage } from "@/lib/errors";
import { syncInstalledVpksFromManifest } from "@/lib/mods/sync-installed-vpks";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import type { KeptChoices } from "@/types/generated/KeptChoices";
import { isTauriError } from "@/types/tauri";
import { usePersistedStore } from "@/lib/store";
import type {
  InstallableMod,
  LocalMod,
  LocalModWithFiles,
  ModFileTree,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

const logger = createLogger("install-with-collection");

export type InstallWithCollectionOptions = InstallAnalyticsOptions & {
  onFileTreeAnalyzed?: (mod: LocalMod, fileTree: ModFileTree) => void;
  skipFileSelection?: boolean;
  bisectOriginalEnabled?: string[];
  keepBothWith?: string[];
  unattended?: boolean;
  keptChoices?: KeptChoices | null;
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
  const { mutateAsync: installWithConflictResolution } =
    useModelConflictInstall();
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
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
      logger
        .withMetadata({
          modId: mod.remoteId,
          hasFileTree: !!fileTree,
          selectedFiles: fileTree?.files.filter((f) => f.is_selected).length,
        })
        .info("Performing installation");

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      if (
        fileTree?.has_multiple_files &&
        fileTree.files.some((file) => file.archive_name)
      ) {
        logger
          .withMetadata({
            modId: mod.remoteId,
            selectedFiles: fileTree.files.filter((f) => f.is_selected).length,
          })
          .info("Copying selected VPKs from archive");

        await invokeGuarded("copy_selected_vpks_from_archive", {
          modId: mod.remoteId,
          fileTree,
          profileFolder,
          isMap: mod.isMap,
        });
      }

      const modData: LocalModWithFiles = {
        ...mod,
        file_tree: fileTree,
      };

      const result = await installWithConflictResolution({
        mod: modData,
        profileFolder,
        bisectOriginalEnabled: options.bisectOriginalEnabled,
        keepBothWith: options.keepBothWith,
        unattended: options.unattended,
        keptChoices: options.keptChoices,
      });
      if (!result) {
        options.onCancel?.(mod, "modelConflict");
        return null;
      }
      await syncInstalledVpksFromManifest(profileFolder);

      options.onComplete(mod, result);
      return result;
    } catch (error) {
      logger
        .withMetadata({ modId: mod.remoteId })
        .withError(error)
        .error("Installation failed");

      options.onError(
        mod,
        isTauriError(error)
          ? error
          : { kind: "unknown", message: getErrorMessage(error) },
      );
      return null;
    }
  };

  const install: InstallWithCollectionFunction = async (
    mod,
    originalOptions,
    preselectedFileTree,
  ) => {
    const options = trackInstallOptions(mod, originalOptions);
    try {
      options.onStart(mod);

      if (mod.status === ModStatus.Installed) {
        throw new Error("Mod is already installed!");
      }

      if (preselectedFileTree) {
        logger
          .withMetadata({
            modId: mod.remoteId,
            selectedFiles: preselectedFileTree.files.filter(
              (f) => f.is_selected,
            ).length,
          })
          .info("Using preselected file tree");

        return await performInstallation(mod, options, preselectedFileTree);
      }

      if (mod.installedFileTree) {
        logger
          .withMetadata({
            modId: mod.remoteId,
            totalFiles: mod.installedFileTree.total_files,
            hasMultipleFiles: mod.installedFileTree.has_multiple_files,
            hasInstalledVpks: !!mod.installedVpks?.length,
          })
          .info("Using stored file tree from download");

        options.onFileTreeAnalyzed?.(mod, mod.installedFileTree);

        if (requiresFileSelection(mod.installedFileTree)) {
          let previousSelection = previousInstallSelection(mod);
          if (!previousSelection) {
            const { manifest } = await getProfileVpkSnapshot(
              getActiveProfile()?.folderName ?? null,
            );
            previousSelection = previousInstallSelection(mod, manifest);
          }
          if (previousSelection) {
            logger
              .withMetadata({
                modId: mod.remoteId,
                selectedFiles: previousSelection.files.filter(
                  (f) => f.is_selected,
                ).length,
              })
              .info("Mod has previous VPK selection, using it for re-enable");

            return await performInstallation(mod, options, previousSelection);
          }

          const downloadTimeSelection = applyDownloadTimeSelection(
            mod,
            mod.installedFileTree,
          );
          if (downloadTimeSelection) {
            logger
              .withMetadata({
                modId: mod.remoteId,
                selectedFiles: downloadTimeSelection.files.filter(
                  (f) => f.is_selected,
                ).length,
                totalFiles: downloadTimeSelection.total_files,
              })
              .info("Using variant selected during download");

            return await performInstallation(
              mod,
              options,
              downloadTimeSelection,
            );
          }

          if (options.skipFileSelection) {
            options.onCancel?.(mod);
            return null;
          }

          logger
            .withMetadata({
              modId: mod.remoteId,
              totalFiles: mod.installedFileTree.total_files,
            })
            .info("Mod has multiple files, showing file selector dialog");

          setCurrentMod(mod);
          setCurrentOptions(options);
          setCurrentFileTree(mod.installedFileTree);
          setShowFileSelector(true);
          setIsAnalyzing(false);

          return null;
        }

        logger
          .withMetadata({
            modId: mod.remoteId,
            totalFiles: mod.installedFileTree.total_files,
          })
          .info(
            "Mod has single file or no files, proceeding with installation",
          );

        return await performInstallation(mod, options, mod.installedFileTree);
      }

      setIsAnalyzing(true);
      let fileTree: ModFileTree | null = null;

      try {
        logger
          .withMetadata({ modId: mod.remoteId })
          .info("Analyzing mod file tree");

        fileTree = await readModFileTree(mod);

        logger
          .withMetadata({
            modId: mod.remoteId,
            totalFiles: fileTree.total_files,
            hasMultipleFiles: fileTree.has_multiple_files,
          })
          .info("File tree analysis complete");

        options.onFileTreeAnalyzed?.(mod, fileTree);

        if (fileTree.has_multiple_files) {
          const downloadTimeSelection = applyDownloadTimeSelection(
            mod,
            fileTree,
          );
          if (downloadTimeSelection) {
            logger
              .withMetadata({
                modId: mod.remoteId,
                selectedFiles: downloadTimeSelection.files.filter(
                  (f) => f.is_selected,
                ).length,
                totalFiles: downloadTimeSelection.total_files,
              })
              .info("Using variant selected during download");

            setIsAnalyzing(false);
            return await performInstallation(
              mod,
              options,
              downloadTimeSelection,
            );
          }

          if (options.skipFileSelection) {
            setIsAnalyzing(false);
            options.onCancel?.(mod);
            return null;
          }

          logger
            .withMetadata({
              modId: mod.remoteId,
              totalFiles: fileTree.total_files,
            })
            .info("Mod has multiple files, showing file selector dialog");

          setCurrentMod(mod);
          setCurrentOptions(options);
          setCurrentFileTree(fileTree);
          setShowFileSelector(true);
          setIsAnalyzing(false);

          return null;
        }

        logger
          .withMetadata({
            modId: mod.remoteId,
            totalFiles: fileTree.total_files,
          })
          .info(
            "Mod has single file or no files, proceeding with installation",
          );

        setIsAnalyzing(false);
        return await performInstallation(mod, options, fileTree);
      } catch (error) {
        setIsAnalyzing(false);
        logger
          .withMetadata({ modId: mod.remoteId })
          .withError(error)
          .warn(
            "File tree analysis failed, proceeding with direct installation",
          );

        return await performInstallation(mod, options);
      }
    } catch (error) {
      setIsAnalyzing(false);
      logger
        .withMetadata({ modId: mod.remoteId })
        .withError(error)
        .error("Installation process failed");

      options.onError(
        mod,
        isTauriError(error)
          ? error
          : { kind: "unknown", message: getErrorMessage(error) },
      );
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

    logger
      .withMetadata({
        modId: currentMod.remoteId,
        selectedFiles: fileTree.files.filter((f) => f.is_selected).length,
      })
      .info("User confirmed installation");

    setShowFileSelector(false);

    try {
      await performInstallation(currentMod, currentOptions, fileTree);
    } finally {
      setCurrentMod(null);
      setCurrentOptions(null);
      setCurrentFileTree(null);
    }
  };

  const cancelInstallation = (): void => {
    if (currentMod && currentOptions) {
      logger
        .withMetadata({ modId: currentMod.remoteId })
        .info("User canceled installation");

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
