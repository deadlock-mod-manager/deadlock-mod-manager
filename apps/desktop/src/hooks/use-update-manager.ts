import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";
import { createLogger } from "@/lib/logger";

const logger = createLogger("updater");

const useUpdateManager = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [size, setSize] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadProgress = size > 0 ? Math.round((downloaded / size) * 100) : 0;

  const checkForUpdates = async () => {
    try {
      const update = await check();
      setUpdate(update);
      return update;
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .error("Failed to check for updates");
      return null;
    }
  };

  const updateAndRelaunch = async () => {
    if (!update) {
      return;
    }

    setIsDownloading(true);
    setDownloaded(0);
    setSize(0);

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          setSize(event.data.contentLength ?? 0);
          logger
            .withMetadata({ contentLength: event.data.contentLength })
            .info("started downloading");
          break;
        case "Progress":
          setDownloaded((prev) => prev + event.data.chunkLength);
          logger.withMetadata({ downloaded, size }).info("downloaded");
          break;
        case "Finished":
          logger.info("download finished");
          break;
        default:
          logger.withMetadata({ event }).info("Unknown update event");
          break;
      }
    });
    await relaunch();
  };

  const reset = () => {
    setUpdate(null);
    setDownloaded(0);
    setSize(0);
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
