import { analytics } from "@/lib/analytics";
import { DownloadQueue } from "./queue";
import i18n from "@/lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DownloadableMod,
  DownloadFailure,
  DownloadFailureReason,
  DownloadSource,
  FontInfo,
  ModFileTree,
  Progress,
} from "@/types/mods";
import { createLogger } from "../logger";
import { isDownloadInProgress } from "./status";
import { usePersistedStore } from "../store";
import { ModStatus } from "@/types/mods";
import type { ConfigFoundEvent } from "@/types/generated/ConfigFoundEvent";

const logger = createLogger("download-manager");

interface DownloadStartedEvent {
  modId: string;
}

export interface DownloadProgressEvent {
  modId: string;
  fileIndex: number;
  totalFiles: number;
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
  percentage: number;
  source: DownloadSource | null;
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
  reason: DownloadFailureReason | null;
  retryAfterSecs: number | null;
}

/** Says whose side a server failure is on, in place of the raw HTTP error. */
const describeFailure = ({ reason }: DownloadFailure) =>
  reason === "sourceBusy"
    ? i18n.t("downloads.health.busyTitle")
    : i18n.t("downloads.health.stoppedTitle");

interface DownloadPausedEvent {
  modId: string;
}

interface DownloadResumedEvent {
  modId: string;
}

class DownloadManager {
  private downloads = new DownloadQueue({
    start: (properties) => analytics.start("mod_download", properties),
    queue: (mod) => this.queueDownload(mod),
    cancel: (modId) => invoke<void>("cancel_download", { modId }),
    duplicateMessage: () => i18n.t("downloads.alreadyQueued"),
    // The mod's onError gets the same failure, and its caller tells the user.
    onQueueError: (error) => {
      logger.withError(error).error("Failed to queue download");
    },
  });
  private unlistenFns: UnlistenFn[] = [];
  private onFontsFoundHandler?: (
    modId: string,
    modName: string,
    fonts: FontInfo[],
  ) => void;
  private onConfigFoundHandler?: (event: ConfigFoundEvent) => void;

  async init() {
    logger.info("Download manager initializing");

    const unlistenStarted = await listen<DownloadStartedEvent>(
      "download-started",
      (event) => {
        const mod = this.downloads.getMod(event.payload.modId);
        if (mod) {
          logger
            .withMetadata({ mod: event.payload.modId })
            .info("Download started");
          usePersistedStore.getState().patchModProgress(event.payload.modId, {
            percentage: 0,
            speed: 0,
            source: undefined,
            failure: undefined,
            slowSince: Date.now(),
          });
          mod.onStart();
        }
      },
    );

    const unlistenProgress = await listen<DownloadProgressEvent>(
      "download-progress",
      (event) => {
        const mod = this.downloads.getMod(event.payload.modId);
        if (mod) {
          const progress: Progress = {
            progress: event.payload.progress,
            progressTotal: event.payload.progressTotal,
            total: event.payload.total,
            transferSpeed: event.payload.transferSpeed,
            percentage: event.payload.percentage,
            source: event.payload.source,
          };
          mod.onProgress(progress);
        }
      },
    );

    const unlistenCompleted = await listen<DownloadCompletedEvent>(
      "download-completed",
      (event) => {
        const mod = this.downloads.getMod(event.payload.modId);
        if (mod) {
          logger
            .withMetadata({
              mod: event.payload.modId,
              path: event.payload.path,
            })
            .info("Download complete");
          this.downloads.complete(event.payload.modId, event.payload.path);
        }
      },
    );

    const unlistenError = await listen<DownloadErrorEvent>(
      "download-error",
      (event) => {
        const mod = this.downloads.getMod(event.payload.modId);
        if (mod) {
          const { modId, error, reason, retryAfterSecs } = event.payload;
          logger
            .withMetadata({ mod: modId, reason })
            .withError(new Error(error))
            .error("Download error");
          if (reason) {
            const failure = { reason, retryAfterSecs };
            usePersistedStore.getState().patchModProgress(modId, { failure });
            this.downloads.fail(modId, describeFailure(failure));
          } else {
            this.downloads.fail(modId, error);
          }
        }
      },
    );

    const unlistenExtracting = await listen<DownloadExtractingEvent>(
      "download-extracting",
      (event) => {
        logger
          .withMetadata({ mod: event.payload.modId })
          .info("Extracting archive for mod");
        usePersistedStore
          .getState()
          .setModStatus(event.payload.modId, ModStatus.Extracting);
      },
    );

    const unlistenFileTree = await listen<DownloadFileTreeEvent>(
      "download-file-tree",
      (event) => {
        const mod = this.downloads.getMod(event.payload.modId);
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
            store.setInstalledVpks(
              event.payload.modId,
              localMod.installedVpks || [],
              event.payload.fileTree,
            );

            const archiveNames = new Set<string>();
            for (const f of event.payload.fileTree.files) {
              if (f.archive_name) archiveNames.add(f.archive_name);
            }
            if (archiveNames.size > 0) {
              store.setActiveVariantArchive(
                event.payload.modId,
                [...archiveNames].join(","),
              );
            }
          }
        }
      },
    );

    const unlistenFontsFound = await listen<DownloadFontsFoundEvent>(
      "download-fonts-found",
      (event) => {
        if (this.onFontsFoundHandler) {
          const mod = this.downloads.getMod(event.payload.modId);
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

    const unlistenConfigFound = await listen<ConfigFoundEvent>(
      "download-config-found",
      (event) => {
        if (!this.onConfigFoundHandler) return;
        const mod = this.downloads.getMod(event.payload.modId);
        logger
          .withMetadata({
            mod: event.payload.modId,
            variantCount: event.payload.variants.length,
          })
          .info("Performance config found in mod download");
        this.onConfigFoundHandler({
          ...event.payload,
          modName: mod?.name ?? event.payload.modName,
        });
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
        const store = usePersistedStore.getState();
        // The time spent paused is not the server being slow, and neither is the
        // wait in the queue a resumed download may have. The clock restarts when
        // the download does.
        store.patchModProgress(event.payload.modId, { slowSince: undefined });
        store.setModStatus(event.payload.modId, ModStatus.Downloading);
      },
    );

    this.unlistenFns.push(
      unlistenStarted,
      unlistenProgress,
      unlistenCompleted,
      unlistenExtracting,
      unlistenFileTree,
      unlistenFontsFound,
      unlistenConfigFound,
      unlistenPaused,
      unlistenResumed,
      unlistenError,
    );

    await this.reconcileStaleDownloads();

    logger.info("Download manager initialized");
  }

  private async reconcileStaleDownloads() {
    let activeDownloads: { modId: string }[] = [];
    try {
      activeDownloads = (await this.getAllDownloads()) as { modId: string }[];
    } catch (error) {
      logger
        .withError(error)
        .warn("Could not fetch active downloads for reconciliation");
      return;
    }

    // A webview reload drops the queue entries that route backend events to a
    // mod, so a download the backend kept running can never report progress or
    // completion. Cancel it; the stale scan below then offers a retry.
    await Promise.allSettled(
      activeDownloads
        .filter(({ modId }) => !this.isQueued(modId))
        .map(async ({ modId }) => {
          logger
            .withMetadata({ mod: modId })
            .warn("Cancelling backend download orphaned by a reload");
          try {
            await invoke("cancel_download", { modId });
          } catch (error) {
            logger
              .withMetadata({ mod: modId })
              .withError(error)
              .warn("Failed to cancel orphaned download");
          }
        }),
    );

    const store = usePersistedStore.getState();
    // Any mod left in a transient in-flight state (Downloading, Paused,
    // Extracting) without a queue entry is stale and should be flagged as failed
    // so the UI doesn't show a phantom queue.
    // setModStatus resolves a mod through the active profile's list, so the scan
    // has to read from there as well: a mod present only in localMods would be
    // flagged here and then dropped by the writer as "Mod not found".
    const trackedMods =
      store.profiles[store.activeProfileId]?.mods ?? store.localMods;
    const staleMods = trackedMods.filter(
      (mod) => isDownloadInProgress(mod.status) && !this.isQueued(mod.remoteId),
    );

    for (const mod of staleMods) {
      logger
        .withMetadata({ mod: mod.remoteId, previousStatus: mod.status })
        .warn(
          "Stale in-flight download status on startup (no queue entry); marking as FailedToDownload",
        );
      store.setModStatus(mod.remoteId, ModStatus.FailedToDownload);
    }
  }

  setFontsFoundHandler(
    handler: (modId: string, modName: string, fonts: FontInfo[]) => void,
  ) {
    this.onFontsFoundHandler = handler;
  }

  setConfigFoundHandler(handler?: (event: ConfigFoundEvent) => void) {
    this.onConfigFoundHandler = handler;
  }

  async cleanup() {
    for (const unlisten of this.unlistenFns) {
      unlisten();
    }
    this.unlistenFns = [];
    this.downloads.clear();
  }

  /** Whether a download for the mod is still waiting for its outcome. */
  isQueued(modId: string) {
    return this.downloads.getMod(modId) !== undefined;
  }

  addToQueue(mod: DownloadableMod) {
    this.downloads.add(mod);
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

    // Downloads run one at a time, so a retry can wait behind another one with
    // its last attempt's slow clock still set. The clock restarts when it starts.
    const store = usePersistedStore.getState();
    if (store.getModProgress(mod.remoteId)?.slowSince !== undefined) {
      store.patchModProgress(mod.remoteId, { slowSince: undefined });
    }

    const profileFolder = mod.profileFolder ?? null;

    const files = mod.downloads.map((d) => ({
      url: d.url,
      name: d.name,
      size: d.size || 0,
      md5Checksum: d.md5Checksum,
    }));
    const { fileserverPreference } = usePersistedStore.getState();

    await invoke("queue_download", {
      modId: mod.remoteId,
      files,
      profileFolder,
      fileserverPreference,
      isMap: mod.isMap,
    });
  }

  async cancelDownload(modId: string) {
    try {
      const tracked = await this.downloads.cancel(modId);
      // Without a queue entry no callback settles the mod, so it would stay
      // stuck in its in-flight status.
      if (!tracked) {
        usePersistedStore
          .getState()
          .setModStatus(modId, ModStatus.FailedToDownload);
      }
      logger.withMetadata({ mod: modId }).info("Download cancelled");
    } catch (error) {
      logger.withError(error).error("Failed to cancel download");
      throw error;
    }
  }

  /** Quietly stops a download so deleting its mod doesn't leave it running. */
  async discardDownload(modId: string) {
    if (!this.isQueued(modId)) return;
    try {
      await this.downloads.cancel(modId, false);
    } catch (error) {
      // The download may have ended while the cancel was in flight.
      if (this.isQueued(modId)) {
        logger.withError(error).error("Failed to cancel download");
        throw error;
      }
    }
    // The mod outlives a delete that fails after this, so it can't stay in flight.
    if (!this.isQueued(modId)) {
      usePersistedStore
        .getState()
        .setModStatus(modId, ModStatus.FailedToDownload);
    }
    logger.withMetadata({ mod: modId }).info("Download discarded");
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
