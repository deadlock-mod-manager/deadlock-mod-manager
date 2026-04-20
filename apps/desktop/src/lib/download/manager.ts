import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DownloadableMod,
  FontInfo,
  ModFileTree,
  Progress,
} from "@/types/mods";
import { getGameBananaFileservers } from "../api";
import { createLogger } from "../logger";
import { usePersistedStore } from "../store";
import { ModStatus } from "@/types/mods";
import { resolveDownloadFileUrls } from "./fileserver";

const logger = createLogger("download-manager");

interface DownloadStartedEvent {
  modId: string;
}

interface DownloadProgressEvent {
  modId: string;
  fileIndex: number;
  totalFiles: number;
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
  percentage: number;
}

interface DownloadCompletedEvent {
  modId: string;
  path: string;
}

interface DownloadFileTreeEvent {
  modId: string;
  fileTree: ModFileTree;
}

interface DownloadExtractingEvent {
  modId: string;
}

interface DownloadFontsFoundEvent {
  modId: string;
  fonts: FontInfo[];
}

interface DownloadErrorEvent {
  modId: string;
  error: string;
}

interface DownloadPausedEvent {
  modId: string;
}

interface DownloadResumedEvent {
  modId: string;
}

class DownloadManager {
  private pendingDownloads: Map<string, DownloadableMod> = new Map();
  private unlistenFns: UnlistenFn[] = [];
  private onFontsFoundHandler?: (
    modId: string,
    modName: string,
    fonts: FontInfo[],
  ) => void;

  async init() {
    logger.info("Download manager initializing");

    const unlistenStarted = await listen<DownloadStartedEvent>(
      "download-started",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          logger
            .withMetadata({ mod: event.payload.modId })
            .info("Download started");
          mod.onStart();
        }
      },
    );

    const unlistenProgress = await listen<DownloadProgressEvent>(
      "download-progress",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          const progress: Progress = {
            progress: event.payload.progress,
            progressTotal: event.payload.progressTotal,
            total: event.payload.total,
            transferSpeed: event.payload.transferSpeed,
          };
          mod.onProgress(progress);
        }
      },
    );

    const unlistenCompleted = await listen<DownloadCompletedEvent>(
      "download-completed",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          logger
            .withMetadata({
              mod: event.payload.modId,
              path: event.payload.path,
            })
            .info("Download complete");
          mod.onComplete(event.payload.path);
          this.pendingDownloads.delete(event.payload.modId);
        }
      },
    );

    const unlistenError = await listen<DownloadErrorEvent>(
      "download-error",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          logger
            .withMetadata({ mod: event.payload.modId })
            .withError(new Error(event.payload.error))
            .error("Download error");
          mod.onError(new Error(event.payload.error));
          this.pendingDownloads.delete(event.payload.modId);
        }
      },
    );

    const unlistenExtracting = await listen<DownloadExtractingEvent>(
      "download-extracting",
      (event) => {
        logger
          .withMetadata({ mod: event.payload.modId })
          .info("Extracting archive for mod");
      },
    );

    const unlistenFileTree = await listen<DownloadFileTreeEvent>(
      "download-file-tree",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          logger
            .withMetadata({
              mod: event.payload.modId,
              totalFiles: event.payload.fileTree.total_files,
              hasMultiple: event.payload.fileTree.has_multiple_files,
            })
            .info("File tree received for mod");

          // Store file tree in mod metadata
          const store = usePersistedStore.getState();
          const localMod = store.localMods.find(
            (m) => m.remoteId === event.payload.modId,
          );
          if (localMod) {
            // Store file tree in mod - we'll use it during installation
            store.setInstalledVpks(
              event.payload.modId,
              localMod.installedVpks || [],
              event.payload.fileTree,
            );
          }
        }
      },
    );

    const unlistenFontsFound = await listen<DownloadFontsFoundEvent>(
      "download-fonts-found",
      (event) => {
        if (this.onFontsFoundHandler) {
          const mod = this.pendingDownloads.get(event.payload.modId);
          const modName = mod?.name ?? event.payload.modId;
          logger
            .withMetadata({
              mod: event.payload.modId,
              fontCount: event.payload.fonts.length,
            })
            .info("Fonts found in mod download");
          this.onFontsFoundHandler(
            event.payload.modId,
            modName,
            event.payload.fonts,
          );
        }
      },
    );

    const unlistenPaused = await listen<DownloadPausedEvent>(
      "download-paused",
      (event) => {
        logger
          .withMetadata({ mod: event.payload.modId })
          .info("Download paused");
        usePersistedStore
          .getState()
          .setModStatus(event.payload.modId, ModStatus.Paused);
      },
    );

    const unlistenResumed = await listen<DownloadResumedEvent>(
      "download-resumed",
      (event) => {
        logger
          .withMetadata({ mod: event.payload.modId })
          .info("Download resumed");
        usePersistedStore
          .getState()
          .setModStatus(event.payload.modId, ModStatus.Downloading);
      },
    );

    this.unlistenFns.push(
      unlistenStarted,
      unlistenProgress,
      unlistenCompleted,
      unlistenExtracting,
      unlistenFileTree,
      unlistenFontsFound,
      unlistenPaused,
      unlistenResumed,
      unlistenError,
    );

    await this.reconcilePausedDownloads();

    logger.info("Download manager initialized");
  }

  private async reconcilePausedDownloads() {
    let activeDownloads: { modId: string }[] = [];
    try {
      activeDownloads = (await this.getAllDownloads()) as { modId: string }[];
    } catch (error) {
      logger
        .withError(error)
        .warn("Could not fetch active downloads for reconciliation");
      return;
    }

    const activeIds = new Set(activeDownloads.map((d) => d.modId));
    const store = usePersistedStore.getState();
    const stalePaused = store.localMods.filter(
      (mod) => mod.status === ModStatus.Paused && !activeIds.has(mod.remoteId),
    );

    for (const mod of stalePaused) {
      logger
        .withMetadata({ mod: mod.remoteId })
        .warn(
          "Stale Paused status on startup (no backend entry); marking as FailedToDownload",
        );
      store.setModStatus(mod.remoteId, ModStatus.FailedToDownload);
    }
  }

  setFontsFoundHandler(
    handler: (modId: string, modName: string, fonts: FontInfo[]) => void,
  ) {
    this.onFontsFoundHandler = handler;
  }

  async cleanup() {
    for (const unlisten of this.unlistenFns) {
      unlisten();
    }
    this.unlistenFns = [];
    this.pendingDownloads.clear();
  }

  addToQueue(mod: DownloadableMod) {
    this.pendingDownloads.set(mod.remoteId, mod);
    this.queueDownload(mod).catch((error) => {
      logger.withError(error).error("Failed to queue download");
      toast.error(`Failed to queue download: ${error.message}`);
      mod.onError(error);
      this.pendingDownloads.delete(mod.remoteId);
    });
  }

  private async queueDownload(mod: DownloadableMod) {
    if (!mod.downloads || mod.downloads.length === 0) {
      throw new Error("No downloads available for this mod");
    }

    logger
      .withMetadata({
        mod: mod.remoteId,
        files: mod.downloads.length,
      })
      .info("Queueing download for mod");

    const profileFolder = mod.profileFolder ?? null;

    const { fileserverPreference, fileserverLatencyMs } =
      usePersistedStore.getState();

    let files = mod.downloads.map((d) => ({
      url: d.url,
      name: d.name,
      size: d.size || 0,
    }));

    if (fileserverPreference !== "default") {
      try {
        const fileservers = await getGameBananaFileservers();
        files = resolveDownloadFileUrls({
          files,
          preference: fileserverPreference,
          fileservers,
          latencyMs: fileserverLatencyMs,
          isAudio: mod.isAudio,
        });
      } catch (error) {
        logger
          .withError(error)
          .warn("Failed to resolve fileserver URLs; using original URLs");
      }
    }

    await invoke("queue_download", {
      modId: mod.remoteId,
      files,
      profileFolder,
      isMap: mod.isMap,
    });
  }

  async cancelDownload(modId: string) {
    try {
      await invoke("cancel_download", { modId });
      this.pendingDownloads.delete(modId);
      logger.withMetadata({ mod: modId }).info("Download cancelled");
    } catch (error) {
      logger.withError(error).error("Failed to cancel download");
      throw error;
    }
  }

  async pauseDownload(modId: string) {
    try {
      await invoke("pause_download", { modId });
      logger.withMetadata({ mod: modId }).info("Pause requested");
    } catch (error) {
      logger.withError(error).error("Failed to pause download");
      throw error;
    }
  }

  async resumeDownload(modId: string) {
    try {
      await invoke("resume_download", { modId });
      logger.withMetadata({ mod: modId }).info("Resume requested");
    } catch (error) {
      logger.withError(error).error("Failed to resume download");
      throw error;
    }
  }

  async getDownloadStatus(modId: string) {
    try {
      return await invoke("get_download_status", { modId });
    } catch (error) {
      logger.withError(error).error("Failed to get download status");
      throw error;
    }
  }

  async getAllDownloads() {
    try {
      return await invoke("get_all_downloads");
    } catch (error) {
      logger.withError(error).error("Failed to get all downloads");
      throw error;
    }
  }
}

export const downloadManager = new DownloadManager();
