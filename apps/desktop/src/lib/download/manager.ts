import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DownloadableMod, ModFileTree, Progress } from "@/types/mods";
import { createLogger } from "../logger";
import { usePersistedStore } from "../store";

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

interface DownloadErrorEvent {
  modId: string;
  error: string;
}

class DownloadManager {
  private pendingDownloads: Map<string, DownloadableMod> = new Map();
  private unlistenFns: UnlistenFn[] = [];

  async init() {
    logger.info("Download manager initializing");

    const unlistenStarted = await listen<DownloadStartedEvent>(
      "download-started",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          logger.info("Download started", { mod: event.payload.modId });
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
          logger.info("Download complete", {
            mod: event.payload.modId,
            path: event.payload.path,
          });
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
          logger.error("Download error", {
            mod: event.payload.modId,
            error: event.payload.error,
          });
          mod.onError(new Error(event.payload.error));
          this.pendingDownloads.delete(event.payload.modId);
        }
      },
    );

    const unlistenFileTree = await listen<DownloadFileTreeEvent>(
      "download-file-tree",
      (event) => {
        const mod = this.pendingDownloads.get(event.payload.modId);
        if (mod) {
          logger.info("File tree received for mod", {
            mod: event.payload.modId,
            totalFiles: event.payload.fileTree.total_files,
            hasMultiple: event.payload.fileTree.has_multiple_files,
          });

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

    this.unlistenFns.push(
      unlistenStarted,
      unlistenProgress,
      unlistenCompleted,
      unlistenFileTree,
      unlistenError,
    );

    logger.info("Download manager initialized");
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
      logger.error("Failed to queue download", { error });
      toast.error(`Failed to queue download: ${error.message}`);
      mod.onError(error);
      this.pendingDownloads.delete(mod.remoteId);
    });
  }

  private async queueDownload(mod: DownloadableMod) {
    if (!mod.downloads || mod.downloads.length === 0) {
      throw new Error("No downloads available for this mod");
    }

    logger.info("Queueing download for mod", {
      mod: mod.remoteId,
      files: mod.downloads.length,
    });

    const profileFolder = mod.profileFolder ?? null;

    await invoke("queue_download", {
      modId: mod.remoteId,
      files: mod.downloads.map((d) => ({
        url: d.url,
        name: d.name,
        size: d.size || 0,
      })),
      profileFolder,
    });
  }

  async cancelDownload(modId: string) {
    try {
      await invoke("cancel_download", { modId });
      this.pendingDownloads.delete(modId);
      logger.info("Download cancelled", { mod: modId });
    } catch (error) {
      logger.error("Failed to cancel download", { error });
      throw error;
    }
  }

  async getDownloadStatus(modId: string) {
    try {
      return await invoke("get_download_status", { modId });
    } catch (error) {
      logger.error("Failed to get download status", { error });
      throw error;
    }
  }

  async getAllDownloads() {
    try {
      return await invoke("get_all_downloads");
    } catch (error) {
      logger.error("Failed to get all downloads", { error });
      throw error;
    }
  }
}

export const downloadManager = new DownloadManager();
