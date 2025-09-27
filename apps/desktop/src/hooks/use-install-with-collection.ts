import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { createLogger } from "@/lib/logger";
import { useConfirm } from "@/components/providers/alert-dialog";
import { usePersistedStore } from "@/lib/store";
import { useTranslation } from "react-i18next";
import type {
  InstallableMod,
  LocalMod,
  LocalModWithFiles,
  ModFileTree,
} from "@/types/mods";
import { ModStatus } from "@/types/mods";
import type { ErrorKind } from "@/types/tauri";

const logger = createLogger("activate-with-collection");

export type ActivationOptions = {
  onStart: (mod: LocalMod) => void;
  onComplete: (mod: LocalMod, result: InstallableMod) => void;
  onError: (mod: LocalMod, error: ErrorKind) => void;
  onCancel?: (mod: LocalMod) => void;
  onFileTreeAnalyzed?: (mod: LocalMod, fileTree: ModFileTree) => void;
};

export type ActivateWithCollectionFunction = (
  mod: LocalMod,
  options: ActivationOptions,
  preselectedFileTree?: ModFileTree,
) => Promise<InstallableMod | null>;

export type UseActivationWithCollectionReturn = {
  activate: ActivateWithCollectionFunction;
  isAnalyzing: boolean;
  currentFileTree: ModFileTree | null;
  showFileSelector: boolean;
  setShowFileSelector: (show: boolean) => void;
  confirmActivation: (fileTree: ModFileTree) => Promise<void>;
  cancelActivation: () => void;
  currentMod: LocalMod | null;
  currentOptions: ActivationOptions | null;
};

const useActivationWithCollection = (): UseActivationWithCollectionReturn => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentFileTree, setCurrentFileTree] = useState<ModFileTree | null>(
    null,
  );
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [currentMod, setCurrentMod] = useState<LocalMod | null>(null);
  const [currentOptions, setCurrentOptions] =
    useState<ActivationOptions | null>(null);
  const confirm = useConfirm();
  const { setParsedHeroes } = usePersistedStore();
  const { t } = useTranslation();

  const performActivation = async (
    mod: LocalMod,
    options: ActivationOptions,
    fileTree?: ModFileTree,
  ): Promise<InstallableMod | null> => {
    try {
      logger.info("Performing activation", {
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
          path: modData.path,
          file_tree: modData.file_tree,
        },
      })) as InstallableMod;

      options.onComplete(mod, result);
      return result;
    } catch (error: unknown) {
      logger.error("Activation failed", { modId: mod.remoteId, error });

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

  const activate: ActivateWithCollectionFunction = async (
    mod,
    options,
    preselectedFileTree,
  ) => {
    try {
      if (!mod.path) {
        throw new Error("Mod is not downloaded! Might be corrupted.");
      }

      if (mod.status === ModStatus.Installed) {
        throw new Error("Mod is already installed!");
      }

      if (preselectedFileTree) {
        // Only mark as starting right before actual installation
        options.onStart(mod);
        return await performActivation(mod, options, preselectedFileTree);
      }

      setIsAnalyzing(true);
      logger.info("Getting mod file structure", {
        modId: mod.remoteId,
        path: mod.path,
      });

      const fileTree = await invoke<ModFileTree>("get_mod_file_tree", {
        modPath: mod.path,
      });

      setIsAnalyzing(false);

      if (!fileTree) {
        logger.error("Failed to get file tree", { modId: mod.remoteId });
        options.onError(mod, {
          kind: "unknown",
          message: "Failed to analyze mod files",
        });
        return null;
      }

      let parsedHeroes: string[] = [];
      if (mod.path) {
        try {
          parsedHeroes = await invoke<string[]>("detect_heroes_in_download_dir", {
            path: mod.path,
          });
          if (parsedHeroes?.length) {
            setParsedHeroes(mod.remoteId, parsedHeroes);
          }
        } catch (e) {
          logger.warn("Failed to detect heroes pre-activation", {
            modId: mod.remoteId,
            error: (e as Error).message,
          });
        }
      }

      if (parsedHeroes && parsedHeroes.length > 0) {
        const state = usePersistedStore.getState();
        const conflicts = state.localMods.filter(
          (m) =>
            m.status === ModStatus.Installed &&
            m.parsedHeroes &&
            m.parsedHeroes.some((h) => parsedHeroes.includes(h)) &&
            m.remoteId !== mod.remoteId,
        );

        if (conflicts.length > 0) {
          const heroNames = parsedHeroes.join(", ");
          const conflictNames = conflicts.map((m) => m.name).join(", ");
          const accepted = await confirm({
            title: t("modConflict.title", { heroes: heroNames }) as string,
            body: t("modConflict.body", { conflicts: conflictNames }) as string,
            cancelButton: t("common.cancel") as string,
            actionButton: t("common.continue") as string,
            cancelButtonVariant: "ghost",
            actionButtonVariant: "destructive",
          });

          if (!accepted) {
            setIsAnalyzing(false);
            options.onCancel?.(mod);
            return null;
          }
        }
      }

      setCurrentFileTree(fileTree);
      options.onFileTreeAnalyzed?.(mod, fileTree);

      if (!fileTree.has_multiple_files) {
        logger.info("Activating single-file mod directly", {
          modId: mod.remoteId,
          totalFiles: fileTree.total_files,
        });
        // Only mark as starting right before actual installation
        options.onStart(mod);
        return await performActivation(mod, options, fileTree);
      }

      logger.info("Showing file selector", {
        modId: mod.remoteId,
        totalFiles: fileTree.total_files,
      });

      setCurrentMod(mod);
      setCurrentOptions(options);
      setShowFileSelector(true);

      return null;
    } catch (error: unknown) {
      setIsAnalyzing(false);
      logger.error("Activation process failed", {
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

  const confirmActivation = async (fileTree: ModFileTree): Promise<void> => {
    if (!currentMod) {
      logger.error("No current mod for activation confirmation");
      return;
    }

    if (!currentOptions) {
      logger.error("No current options for activation confirmation");
      return;
    }

    logger.info("User confirmed activation", {
      modId: currentMod.remoteId,
      selectedFiles: fileTree.files.filter((f) => f.is_selected).length,
    });

    setShowFileSelector(false);

    try {
      await performActivation(currentMod, currentOptions, fileTree);
    } finally {
      setCurrentMod(null);
      setCurrentOptions(null);
      setCurrentFileTree(null);
    }
  };

  const cancelActivation = (): void => {
    if (currentMod && currentOptions) {
      logger.info("User canceled activation", { modId: currentMod.remoteId });
      currentOptions.onCancel?.(currentMod);
    }
    setShowFileSelector(false);
    setCurrentMod(null);
    setCurrentOptions(null);
    setCurrentFileTree(null);
  };

  return {
    activate,
    isAnalyzing,
    currentFileTree,
    showFileSelector,
    setShowFileSelector,
    confirmActivation,
    cancelActivation,
    currentMod,
    currentOptions,
  };
};

export default useActivationWithCollection;


