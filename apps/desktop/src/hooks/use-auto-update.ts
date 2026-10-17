import { analytics } from "@/lib/analytics";
import { useEffect, useState } from "react";
import { isAutoUpdateDisabled, isFlatpak } from "@/lib/tauri-commands";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import useUpdateManager from "./use-update-manager";
import { showAppUpdateError } from "@/lib/app-update-notifications";

const logger = createLogger("auto-update");

export const useAutoUpdate = (integrationEnabled = true) => {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const updateManager = useUpdateManager();
  const autoUpdateEnabled = usePersistedStore(
    (state) => state.autoUpdateEnabled,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto update hook
  useEffect(() => {
    const checkForUpdatesOnLaunch = async () => {
      if (!integrationEnabled) {
        return;
      }
      try {
        // Check if auto-update is disabled via CLI flag
        const disabledViaCli = await isAutoUpdateDisabled();
        if (disabledViaCli) {
          logger.info(
            "Auto-update is disabled via --disable-auto-update CLI flag",
          );
          return;
        }

        const flatpak = await isFlatpak();
        if (flatpak) {
          logger.info("Running as Flatpak — skipping auto-update on launch");
          return;
        }

        if (import.meta.env.DEV) {
          logger.info("Skipping auto-update on launch in dev mode");
          return;
        }

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
          analytics.track("update_offered", {
            target_version: update.version,
            entry_point: "update_dialog",
          });
          setShowUpdateDialog(true);
        } else {
          logger.info("No updates available");
        }
      } catch (error) {
        logger.withError(error).warn("Failed to check for updates");
      }
    };

    const timeout = setTimeout(checkForUpdatesOnLaunch, 2000);

    return () => clearTimeout(timeout);
  }, [autoUpdateEnabled, integrationEnabled]);

  const handleUpdate = async () => {
    try {
      await updateManager.updateAndRelaunch();
    } catch (error) {
      showAppUpdateError(error);
      setShowUpdateDialog(false);
      updateManager.reset();
    }
  };

  const handleDismiss = () => {
    analytics.track("update_dismissed", {
      target_version: updateManager.update?.version,
      entry_point: "update_dialog",
    });
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
