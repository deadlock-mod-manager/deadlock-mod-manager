import { analytics } from "@/lib/analytics";
import { relaunch } from "@tauri-apps/plugin-process";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import {
  type AppUpdate,
  checkForAppUpdates,
  installAppUpdate,
} from "@/lib/app-updates";

const logger = createLogger("updater");

const useUpdateManager = () => {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [size, setSize] = useState(0);
  const sizeRef = useRef(0);

  const downloadProgress = size > 0 ? Math.round((downloaded / size) * 100) : 0;

  const { mutateAsync: checkForUpdates } = useMutation({
    mutationFn: () => checkForAppUpdates(),
    onMutate: () => setUpdate(null),
    onSuccess: setUpdate,
    meta: { skipGlobalErrorHandler: true },
  });

  const { mutateAsync: install, isPending: isDownloading } = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (available: AppUpdate | null) => {
      if (!available) {
        return;
      }

      const attempt = analytics.start("app_update", {
        target_version: available.version,
        entry_point: "update_dialog",
      });
      setDownloaded(0);
      setSize(0);

      try {
        await installAppUpdate(available, (event) => {
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
      }
    },
  });

  const updateAndRelaunch = (available = update) => install(available);

  const reset = () => {
    setUpdate(null);
    setDownloaded(0);
    setSize(0);
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
