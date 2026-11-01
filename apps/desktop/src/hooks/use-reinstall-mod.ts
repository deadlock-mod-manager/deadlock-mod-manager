import { ValidationError } from "@deadlock-mods/common/client-errors";
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
import { invokeGuarded } from "@/lib/game-guard";

const logger = createLogger("reinstall-mod");

export type ReinstallStep = "purging" | "downloading" | "installing";

export type ReinstallOutcome =
  /** Was installed before and is installed again. */
  | "restored"
  /** Was only downloaded before, so downloaded is where it belongs again. */
  | "downloadedOnly"
  /** Multi-file mod whose previous file selection could not be recovered. */
  | "manual"
  | "failed";

export type ReinstallResult = {
  outcome: ReinstallOutcome;
  error?: string;
  /**
   * Nothing was there to delete - the state was ahead of the file system.
   * Reinstall cannot tell that apart from a normal purge, so it reports false.
   */
  missingOnDisk: boolean;
};

export type ReinstallOptions = {
  onStep?: (step: ReinstallStep) => void;
  onDownloadProgress?: (fraction: number) => void;
  /** Set when the caller already wiped the files itself (nuke & reinstall). */
  skipPurge?: boolean;
};

/**
 * Rebuilds a single mod from scratch: throws away its files, downloads it again
 * with fresh URLs and puts it back into the state it was in before.
 *
 * A purge that finds nothing is not a failure - that is precisely the drift
 * this is meant to repair. A purge that fails stops the reinstall before the
 * state is touched.
 */
export const useReinstallMod = () => {
  const { install } = useInstallWithCollection();

  const reinstallMod = useCallback(
    async (
      target: LocalMod,
      options: ReinstallOptions = {},
    ): Promise<ReinstallResult> => {
      const profileFolder =
        usePersistedStore.getState().getActiveProfile()?.folderName ?? null;
      // Reconciliation demotes a mod with deleted VPKs to downloaded, but its
      // manifest entry still claims them, so it was installed before the drift.
      const wasInstalled =
        target.status === ModStatus.Installed ||
        (target.missingVpks?.length ?? 0) > 0;
      const missingOnDisk = false;

      logger
        .withMetadata({ mod: target.remoteId, wasInstalled, profileFolder })
        .info("Reinstalling mod");

      if (!options.skipPurge) {
        options.onStep?.("purging");
        // Removes both the installed VPKs and the cached download, so the mod
        // really is fetched again instead of restored from cache. Missing files
        // are not an error here, so a rejection means the cleanup did not
        // finish: wiping the state and downloading again would only lose track
        // of whatever is still on disk.
        await invokeGuarded("purge_mod", {
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
        return { outcome: "failed", error: message, missingOnDisk };
      }

      if (!wasInstalled) {
        return { outcome: "downloadedOnly", missingOnDisk };
      }

      options.onStep?.("installing");
      const result = await restore(target, install);
      return { ...result, missingOnDisk };
    },
    [install],
  );

  return { reinstallMod };
};

/**
 * Prefers freshly fetched URLs (the stored ones expire) but keeps the user's
 * original file selection by matching on file name.
 */
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

    // A single-mod reinstall keeps its card in place, so the entry is still
    // there and only needs fresh download data. After a nuke it is gone.
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

/**
 * Installs without ever opening the file selector - a restore has to run
 * unattended. Multi-file mods whose previous selection cannot be recovered are
 * left downloaded and reported, rather than guessing which variant to install.
 */
const restore = async (
  snapshot: LocalMod,
  install: ReturnType<typeof useInstallWithCollection>["install"],
): Promise<Omit<ReinstallResult, "missingOnDisk">> => {
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

  // One VPK per selected download is not a choice: install takes them all.
  if (fileTree && requiresFileSelection(fileTree)) {
    const selection = restoreSelection(fileTree, snapshot);
    if (!selection) {
      return { outcome: "manual" };
    }
    fileTree = selection;
  }

  // Defaults to "manual": if install decides it needs a file selection it just
  // returns without firing a callback, and nobody renders that dialog here.
  let result: Omit<ReinstallResult, "missingOnDisk"> = { outcome: "manual" };

  await install(
    mod,
    {
      analyticsEntryPoint: "reinstall",
      analyticsOperationKind: "reinstall",
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

/**
 * Rebuilds the previous file selection from the snapshot's file tree. Install
 * renames VPKs to pak##_dir.vpk, so `installedVpks` is useless here - the
 * `is_selected` flags on the stored tree are the only reliable record.
 */
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

  // Trees saved before variant names were made unique use plain names, so a
  // file is found by its archive and path first.
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
