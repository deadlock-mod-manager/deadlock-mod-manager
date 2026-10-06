import { analyticsClient } from "@/lib/analytics";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import { getUpdateChannel } from "@/lib/tauri-commands";

const logger = createLogger("updater");

const useUpdateManager = () => {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [size, setSize] = useState(0);
  const sizeRef = useRef(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadProgress = size > 0 ? Math.round((downloaded / size) * 100) : 0;

  const checkForUpdates = async () => {
    try {
      // Nightly follows whatever the nightly feed publishes, even when its
      // version sorts lower (e.g. after the nightly base version changes).
      const channel = await getUpdateChannel();
      const update = await check({ allowDowngrades: channel === "nightly" });
      setUpdate(update);
      return update;
    } catch (error) {
      logger.withError(error).error("Failed to check for updates");
      return null;
    }
  };

  const updateAndRelaunch = async () => {
    if (!update) {
      return;
    }

    const attempt = analyticsClient.start("app_update", {
      target_version: update.version,
      entry_point: "update_dialog",
    });
    setIsDownloading(true);
    setDownloaded(0);
    setSize(0);

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started": {
            const contentLength = event.data.contentLength ?? 0;
            sizeRef.current = contentLength;
            setSize(contentLength);
            logger
              .withMetadata({ contentLength: event.data.contentLength })
              .info("started downloading");
            break;
          }
          case "Progress":
            setDownloaded((prev) => {
              const nextDownloaded = prev + event.data.chunkLength;
              logger
                .withMetadata({
                  chunkLength: event.data.chunkLength,
                  downloaded: nextDownloaded,
                  size: sizeRef.current,
                })
                .info("downloaded");
              return nextDownloaded;
            });
            break;
          case "Finished":
            logger.info("download finished");
            break;
          default:
            logger.withMetadata({ event }).info("Unknown update event");
            break;
        }
      });
      attempt.finish("completed");
      await relaunch();
    } catch (error) {
      attempt.finish("failed");
      throw error;
    } finally {
      setIsDownloading(false);
    }
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
