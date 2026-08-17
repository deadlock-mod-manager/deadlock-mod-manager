import { invoke } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { useCallback } from "react";
import useInstallWithCollection from "@/hooks/use-install-with-collection";
import { getModDownload } from "@/lib/api-client";
import { downloadManager } from "@/lib/download/manager";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import {
  type LocalMod,
  type ModDownloadItem,
  type ModFileTree,
  ModStatus,
} from "@/types/mods";

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
  /** Nothing was there to delete - the state was ahead of the file system. */
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
 * this is meant to repair.
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
      const wasInstalled = target.status === ModStatus.Installed;
      let missingOnDisk = false;

      logger
        .withMetadata({ mod: target.remoteId, wasInstalled, profileFolder })
        .info("Reinstalling mod");

      if (!options.skipPurge) {
        options.onStep?.("purging");
        try {
          // Removes both the installed VPKs and the cached download, so the
          // mod really is fetched again instead of restored from cache.
          await invoke("purge_mod", {
            modId: target.remoteId,
            vpks: target.installedVpks ?? [],
            profileFolder,
          });
        } catch (error) {
          missingOnDisk = true;
          logger
            .withMetadata({ mod: target.remoteId })
            .withError(error)
            .warn("Purge failed during reinstall (files likely already gone)");
        }

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
    throw new Error("No download files available for this mod");
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
      onStart: () => {
        usePersistedStore
          .getState()
          .setModStatus(mod.remoteId, ModStatus.Downloading);
      },
      onProgress: (progress) => {
        usePersistedStore.getState().setModProgress(mod.remoteId, progress);
        onFraction?.(
          progress.total > 0 ? progress.progressTotal / progress.total : 0,
        );
      },
      onComplete: () => {
        usePersistedStore
          .getState()
          .setModStatus(mod.remoteId, ModStatus.Downloaded);
        resolve();
      },
      onError: (error) => {
        usePersistedStore
          .getState()
          .setModStatus(mod.remoteId, ModStatus.FailedToDownload);
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
      const base = await appLocalDataDir();
      const modDir = await join(base, "mods", mod.remoteId);
      fileTree = await invoke<ModFileTree>("get_mod_file_tree", {
        modPath: modDir,
      });
    } catch (error) {
      logger
        .withMetadata({ mod: mod.remoteId })
        .withError(error)
        .warn("Could not analyze file tree after re-download");
    }
  }

  if (fileTree?.has_multiple_files) {
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
  const previous = new Set(
    (snapshot.installedFileTree?.files ?? [])
      .filter((file) => file.is_selected)
      .map((file) => file.name),
  );

  if (previous.size === 0) {
    return null;
  }

  const files = fileTree.files.map((file) => ({
    ...file,
    is_selected: previous.has(file.name),
  }));

  if (!files.some((file) => file.is_selected)) {
    return null;
  }

  return { ...fileTree, files };
};
