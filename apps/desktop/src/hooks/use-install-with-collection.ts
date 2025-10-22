import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { createLogger } from "@/lib/logger";
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
    _preselectedFileTree,
  ) => {
    try {
      options.onStart(mod);

      if (mod.status === ModStatus.Installed) {
        throw new Error("Mod is already installed!");
      }

      // For the new prefix system, we just enable the mod by calling install_mod
      // which will rename the prefixed VPKs
      logger.info("Enabling mod by removing VPK prefix", {
        modId: mod.remoteId,
      });

      const result = (await invoke("install_mod", {
        deadlockMod: {
          id: mod.remoteId,
          name: mod.name,
        },
      })) as InstallableMod;

      options.onComplete(mod, result);
      return result;
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
