import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";
import useUpdateManager from "./use-update-manager";

const logger = createLogger("auto-update");

export const useAutoUpdate = () => {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const updateManager = useUpdateManager();

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto update hook
  useEffect(() => {
    const checkForUpdatesOnLaunch = async () => {
      logger.info("Checking for updates on launch");
      try {
        const update = await updateManager.checkForUpdates();
        if (update) {
          logger.info("Update available:", update.version);
          setShowUpdateDialog(true);
        } else {
          logger.info("No updates available");
        }
      } catch (error) {
        logger.warn("Failed to check for updates", { error });
      }
    };

    const timeout = setTimeout(checkForUpdatesOnLaunch, 2000);

    return () => clearTimeout(timeout);
  }, []);

  const handleUpdate = async () => {
    try {
      await updateManager.updateAndRelaunch();
    } catch (error) {
      logger.error("Failed to update and relaunch", { error });
      setShowUpdateDialog(false);
    }
  };

  const handleDismiss = () => {
    setShowUpdateDialog(false);
    updateManager.reset();
  };

  return {
    showUpdateDialog,
    update: updateManager.update,
    isDownloading: updateManager.isDownloading,
    downloadProgress: updateManager.downloadProgress,
    handleUpdate,
    handleDismiss,
  };
};
