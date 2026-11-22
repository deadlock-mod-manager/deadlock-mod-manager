import { ValidationError } from "@deadlock-mods/common/client-errors";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { getModDownload } from "@/lib/api-client";
import { readModFileTree } from "@/lib/mods/read-mod-file-tree";
import { downloadManager } from "@/lib/download/manager";
import { DownloadAlreadyQueuedError } from "@/lib/download/queue";
import { getErrorMessage } from "@/lib/errors";
import { requiresFileSelection } from "@/lib/mods/mod-variants";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import {
  type LocalMod,
  type ModDownloadItem,
  type ModFile,
  type ModFileTree,
  ModStatus,
} from "@/types/mods";
import type { KeptChoices } from "@/types/generated/KeptChoices";
import { invokeGuarded } from "@/lib/game-guard";

const logger = createLogger("reinstall-mod");

export type ReinstallStep = "purging" | "downloading" | "installing";

export type ReinstallOutcome =
  | "restored"
  | "downloadedOnly"
  | "manual"
  | "failed";

export type ReinstallResult = {
  outcome: ReinstallOutcome;
  error?: string;
};

export type ReinstallOptions = {
  onStep?: (step: ReinstallStep) => void;
  onDownloadProgress?: (fraction: number) => void;
  skipPurge?: boolean;
  keptChoices?: KeptChoices | null;
};

export const useReinstallMod = () => {
  const { install } = useInstallWithCollection();

  const reinstallMod = useCallback(
    async (
      target: LocalMod,
      options: ReinstallOptions = {},
    ): Promise<ReinstallResult> => {
      const profileFolder =
        usePersistedStore.getState().getActiveProfile()?.folderName ?? null;
      const wasInstalled =
        target.status === ModStatus.Installed ||
        (target.missingVpks?.length ?? 0) > 0;

      logger
        .withMetadata({ mod: target.remoteId, wasInstalled, profileFolder })
        .info("Reinstalling mod");

      let keptChoices = options.keptChoices ?? null;
      if (!options.skipPurge) {
        options.onStep?.("purging");
        keptChoices = await invokeGuarded<KeptChoices | null>("purge_mod", {
          modId: target.remoteId,
          vpks: target.installedVpks ?? [],
          profileFolder,
        });

        const store = usePersistedStore.getState();
        store.setInstalledVpks(target.remoteId, []);
        store.setModEnabledInCurrentProfile(target.remoteId, false);
      }

      options.onStep?.("downloading");
      try {
        const { available, files } = await resolveDownloadFiles(target);
        await redownload(
          target,
          available,
          files,
          profileFolder,
          options.onDownloadProgress,
        );
      } catch (error) {
        const message = getErrorMessage(error);
        logger
          .withMetadata({ mod: target.remoteId })
          .withError(error)
          .error("Failed to re-download mod");
        return { outcome: "failed", error: message };
      }

      if (!wasInstalled) {
        if (keptChoices) {
          try {
            await invoke("keep_disabled_mod_choices", {
              modId: target.remoteId,
              profileFolder,
              keptChoices,
            });
          } catch (error) {
            logger
              .withMetadata({ mod: target.remoteId })
              .withError(error)
              .error("Failed to keep the choices of a disabled mod");
            return { outcome: "failed", error: getErrorMessage(error) };
          }
        }
        return { outcome: "downloadedOnly" };
      }

      options.onStep?.("installing");
      return restore(target, install, keptChoices);
    },
    [install],
  );

  return { reinstallMod };
};

const resolveDownloadFiles = async (mod: LocalMod) => {
  let available: ModDownloadItem[] = mod.downloads ?? [];

  try {
    const fresh = await getModDownload(mod.remoteId);
    if (fresh.length > 0) {
      available = fresh;
    }
  } catch (error) {
    logger
      .withMetadata({ mod: mod.remoteId })
      .withError(error)
      .warn("Could not refresh download URLs, falling back to stored ones");
  }

  const selectedNames = new Set(
    (mod.selectedDownloads ?? []).map((file) => file.name),
  );
  const matched = available.filter((file) => selectedNames.has(file.name));
  const files = matched.length > 0 ? matched : available;

  if (files.length > 0) {
    return { available, files };
  }

  const fallback = mod.selectedDownloads ?? [];
  if (fallback.length === 0) {
    throw new ValidationError("No download files available for this mod");
  }
  return { available: fallback, files: fallback };
};

const redownload = (
  mod: LocalMod,
  available: ModDownloadItem[],
  files: ModDownloadItem[],
  profileFolder: string | null,
  onFraction?: (fraction: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const store = usePersistedStore.getState();
    const {
      status: _status,
      installedVpks: _installedVpks,
      installedFileTree: _installedFileTree,
      downloadedAt: _downloadedAt,
      ...modData
    } = mod;

    if (store.localMods.some((m) => m.remoteId === mod.remoteId)) {
      store.setModDownloads(mod.remoteId, available);
      store.setSelectedDownloads(mod.remoteId, files);
      store.setModStatus(mod.remoteId, ModStatus.Downloading);
    } else {
      store.addLocalMod(modData, {
        downloads: available,
        selectedDownloads: files,
        installOrder: mod.installOrder,
      });
    }

    downloadManager.addToQueue({
      ...modData,
      downloads: files,
      profileFolder,
      analyticsEntryPoint: "reinstall",
      analyticsOperationKind: "reinstall",
      onStart: () => {
        usePersistedStore
          .getState()
          .setModStatus(mod.remoteId, ModStatus.Downloading);
      },
      onProgress: (progress) => {
        usePersistedStore.getState().setModProgress(mod.remoteId, progress);
        onFraction?.(progress.percentage / 100);
      },
      onComplete: () => {
        usePersistedStore
          .getState()
          .setModStatus(mod.remoteId, ModStatus.Downloaded);
        resolve();
      },
      onError: (error) => {
        if (!(error instanceof DownloadAlreadyQueuedError)) {
          usePersistedStore
            .getState()
            .setModStatus(mod.remoteId, ModStatus.FailedToDownload);
        }
        reject(error);
      },
    });
  });

const restore = async (
  snapshot: LocalMod,
  install: ReturnType<typeof useInstallWithCollection>["install"],
  keptChoices: KeptChoices | null,
): Promise<ReinstallResult> => {
  const mod = usePersistedStore
    .getState()
    .localMods.find((m) => m.remoteId === snapshot.remoteId);

  if (!mod) {
    return {
      outcome: "failed",
      error: "Mod vanished from state after download",
    };
  }

  let fileTree = mod.installedFileTree;
  if (!fileTree) {
    try {
      fileTree = await readModFileTree(mod);
    } catch (error) {
      logger
        .withMetadata({ mod: mod.remoteId })
        .withError(error)
        .warn("Could not analyze file tree after re-download");
    }
  }

  if (fileTree) {
    const selection = restoreSelection(fileTree, snapshot);
    if (selection) {
      fileTree = selection;
    } else if (requiresFileSelection(fileTree)) {
      return { outcome: "manual" };
    }
  }

  let result: ReinstallResult = { outcome: "manual" };

  await install(
    mod,
    {
      analyticsEntryPoint: "reinstall",
      analyticsOperationKind: "reinstall",
      keptChoices,
      onStart: (m) => {
        usePersistedStore
          .getState()
          .setModStatus(m.remoteId, ModStatus.Installing);
      },
      onComplete: (m, installed) => {
        const store = usePersistedStore.getState();
        store.setModStatus(m.remoteId, ModStatus.Installed);
        store.setInstalledVpks(
          m.remoteId,
          installed.installed_vpks,
          installed.file_tree,
        );
        store.setModEnabledInCurrentProfile(m.remoteId, true);
        result = { outcome: "restored" };
      },
      onCancel: (m) => {
        usePersistedStore
          .getState()
          .setModStatus(m.remoteId, ModStatus.Downloaded);
      },
      onError: (m, error) => {
        usePersistedStore
          .getState()
          .setModStatus(m.remoteId, ModStatus.Downloaded);
        result = { outcome: "failed", error: error.message };
      },
    },
    fileTree,
  );

  return result;
};

const restoreSelection = (
  fileTree: ModFileTree,
  snapshot: LocalMod,
): ModFileTree | null => {
  const saved = snapshot.installedFileTree?.files ?? [];
  const previous = new Set(
    saved.filter((file) => file.is_selected).map((file) => file.name),
  );

  if (previous.size === 0) {
    return null;
  }

  const files = fileTree.files.map((file) => {
    const listed = saved.find(
      (entry) =>
        entry.archive_name &&
        entry.archive_name === file.archive_name &&
        relativePath(entry) === relativePath(file),
    );
    return {
      ...file,
      is_selected: listed ? listed.is_selected : previous.has(file.name),
    };
  });

  if (!files.some((file) => file.is_selected)) {
    return null;
  }

  return { ...fileTree, files };
};

const relativePath = (file: ModFile): string => {
  const path = file.path.replaceAll("\\", "/");
  const archivePrefix = `${file.archive_name}/`;
  return path.startsWith(archivePrefix)
    ? path.slice(archivePrefix.length)
    : path;
};
