import { useEffect, useState } from "react";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { isAutoUpdateDisabled, isFlatpak } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import useUpdateManager from "./use-update-manager";

const logger = createLogger("auto-update");

export const useAutoUpdate = () => {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const updateManager = useUpdateManager();
  const autoUpdateEnabled = usePersistedStore(
    (state) => state.autoUpdateEnabled,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto update hook
  useEffect(() => {
    const checkForUpdatesOnLaunch = async () => {
      try {
        // Check if auto-update is disabled via CLI flag
        const disabledViaCli = await isAutoUpdateDisabled();
        if (disabledViaCli) {
          logger.info(
            "Auto-update is disabled via --disable-auto-update CLI flag",
          );
          return;
        }

        // Flatpak installs cannot self-update; updates must go through flatpak update
        const flatpak = await isFlatpak();
        if (flatpak) {
          logger.info(
            "Running as Flatpak — skipping native updater. Use 'flatpak update' to upgrade.",
          );
          return;
        }

        // Check if auto-update is disabled via GUI setting
        if (!autoUpdateEnabled) {
          logger.info("Auto-update is disabled via GUI setting");
          return;
        }

        logger.info("Checking for updates on launch");
        const update = await updateManager.checkForUpdates();
        if (update) {
          logger
            .withMetadata({ version: update.version })
            .info("Update available");
          setShowUpdateDialog(true);
        } else {
          logger.info("No updates available");
        }
      } catch (error) {
        logger
          .withError(error instanceof Error ? error : new Error(String(error)))
          .warn("Failed to check for updates");
      }
    };

    const timeout = setTimeout(checkForUpdatesOnLaunch, 2000);

    return () => clearTimeout(timeout);
  }, [autoUpdateEnabled]);

  const handleUpdate = async () => {
    try {
      await updateManager.updateAndRelaunch();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.withError(err).error("Failed to update and relaunch");
      toast.error(
        `Update failed: ${err.message}. You may need to manually update the app.`,
      );
      setShowUpdateDialog(false);
      updateManager.reset();
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
