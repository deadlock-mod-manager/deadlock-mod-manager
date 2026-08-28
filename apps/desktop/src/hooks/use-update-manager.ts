import { ProviderError } from "@deadlock-mods/common";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { getUpdateTarget } from "@/lib/tauri-commands";
import { UpdateDownloadSession } from "@/lib/update-download-session";
import {
  buildExactUpdateCheckOptions,
  checkExactUpdate,
  installExactUpdate,
} from "@/lib/update-check";

const logger = createLogger("updater");

const useUpdateManager = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadSessionRef = useRef<UpdateDownloadSession | null>(null);

  if (!downloadSessionRef.current) {
    downloadSessionRef.current = new UpdateDownloadSession({
      now: () => performance.now(),
      scheduleFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      onProgress: setDownloadProgress,
      onInfo: (event) => {
        if (event.kind === "started") {
          logger
            .withMetadata({ artifactSizeBytes: event.artifactSizeBytes })
            .info("Update download started");
          return;
        }
        logger
          .withMetadata({
            outcome: event.kind,
            artifactSizeBytes: event.artifactSizeBytes,
            downloadedBytes: event.downloadedBytes,
            elapsedMs: event.elapsedMs,
          })
          .info("Update download completed");
      },
      onFailure: (event) => {
        logger
          .withError(new Error(event.errorMessage))
          .withMetadata({
            outcome: event.kind,
            artifactSizeBytes: event.artifactSizeBytes,
            downloadedBytes: event.downloadedBytes,
            elapsedMs: event.elapsedMs,
          })
          .error("Update download failed");
      },
    });
  }

  useEffect(() => () => downloadSessionRef.current?.dispose(), []);

  const checkForUpdates = async () => {
    const target = await getUpdateTarget();
    if (target.installationStrategy !== "native") {
      logger
        .withMetadata({
          installer: target.installer,
          installationStrategy: target.installationStrategy,
        })
        .info("Skipping automatic native update for package target");
      return null;
    }

    const outcome = await checkExactUpdate(
      target.manifestTarget,
      (exactTarget) => check(buildExactUpdateCheckOptions(exactTarget)),
    );
    if (outcome.kind === "targetUnavailable") {
      throw new ProviderError(
        `No automatic update artifact exists for ${target.manifestTarget}`,
      );
    }

    const availableUpdate =
      outcome.kind === "available" ? outcome.update : null;
    setUpdate(availableUpdate);
    return availableUpdate;
  };

  const updateAndRelaunch = async () => {
    if (!update) {
      return;
    }

    setIsDownloading(true);
    const downloadSession = downloadSessionRef.current;
    if (!downloadSession) return;
    downloadSession.begin();

    try {
      await installExactUpdate(() =>
        update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started": {
              downloadSession.started(event.data.contentLength);
              break;
            }
            case "Progress":
              downloadSession.progressed(event.data.chunkLength);
              break;
            case "Finished":
              downloadSession.completed();
              break;
          }
        }),
      );
      downloadSession.completed();
      await relaunch();
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (!downloadSession.failed(errorMessage)) {
        logger
          .withError(new Error(errorMessage))
          .withMetadata({ outcome: "failedAfterDownload" })
          .error("Update installation or relaunch failed");
      }
      throw error;
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setUpdate(null);
    setDownloadProgress(0);
    setIsDownloading(false);
  };

  return {
    update,
    checkForUpdates,
    updateAndRelaunch,
    isDownloading,
    downloadProgress,
    reset,
  };
};

export default useUpdateManager;
