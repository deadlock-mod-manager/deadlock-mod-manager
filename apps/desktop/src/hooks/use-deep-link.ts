import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { ModEntryPoint } from "@/lib/analytics/schema";
import { getMod } from "@/lib/api-client";
import { downloadManager } from "@/lib/download/manager";
import { DownloadAlreadyQueuedError } from "@/lib/download/queue";
import logger from "@/lib/logger";
import { serializeSubmissionRef } from "@/lib/mods/submission-ref";
import {
  finishOneClickInstall,
  startOneClickInstall,
} from "@/lib/one-click-installs";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import useInstall from "./use-install";

export type DeepLinkData = {
  download_url: string;
  mod_type: string;
  mod_id: string;
};

const GAMEBANANA_MMDL_REGEX =
  /^https:\/\/(?:[^/]+\.)?gamebanana\.com\/mmdl\/(\d+)(?:[/?#]|$)/i;

export type OneClickInstall = (
  link: DeepLinkData,
  entryPoint: ModEntryPoint,
) => Promise<void>;

/**
 * Downloads and installs a GameBanana 1-click link into the active profile.
 * Mount once: the returned function is stable and de-duplicates by mod.
 */
export const useOneClickInstall = (): OneClickInstall => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const addMod = usePersistedStore((s) => s.addLocalMod);
  const setModStatus = usePersistedStore((s) => s.setModStatus);
  const setModProgress = usePersistedStore((s) => s.setModProgress);
  const setInstalledVpks = usePersistedStore((s) => s.setInstalledVpks);
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const { install } = useInstall();

  const handle: OneClickInstall = async (link, entryPoint) => {
    const { download_url, mod_id, mod_type } = link;
    const submissionType = mod_type.toLowerCase();
    const slug =
      submissionType === "mod" || submissionType === "sound"
        ? serializeSubmissionRef({
            provider: "gamebanana",
            submissionType,
            submissionId: mod_id,
          })
        : null;
    const fileId = download_url.match(GAMEBANANA_MMDL_REGEX)?.[1];

    if (!slug || !fileId) {
      logger.warn("Rejected invalid deep-link payload");
      toast.error(t("mods.invalidDeepLink"));
      return;
    }

    // Prevent duplicate processing of the same mod
    if (!startOneClickInstall(slug, entryPoint)) {
      logger
        .withMetadata({ remoteId: slug })
        .warn("Already processing deep link for mod");
      return;
    }

    logger.withMetadata({ remoteId: slug, fileId }).info("Deep link received");

    try {
      // A clicked link shows its mod; remote installs run in the background
      // and must not pull the user away from what they are doing.
      if (entryPoint !== "remote_install") {
        navigate(`/mods/${slug}`);
      }

      // Fetch mod details from the API
      const modData = await getMod(slug);

      // Check if mod is already installed BEFORE downloading
      const currentMods = usePersistedStore.getState().localMods;
      const existingMod = currentMods.find(
        (m) => m.remoteId === modData.remoteId,
      );
      if (existingMod?.status === ModStatus.Installed) {
        logger
          .withMetadata({ remoteId: modData.remoteId })
          .info("Mod already installed, skipping download and installation");
        toast.success(`${modData.name} is already installed!`);
        // Remove from processing set since we're done
        finishOneClickInstall(slug);
        return;
      }

      toast.success("Preparing 1-click mod download...");

      const downloadFiles = [
        {
          url: `gamebanana-file://${slug}/${fileId}`,
          name: `gamebanana-${fileId}.zip`,
          size: 0,
          md5Checksum: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Add mod to local store with download info
      addMod(modData, { downloads: downloadFiles });

      // Start direct download and installation using the provided URL
      toast.success("Starting 1-click mod install...");

      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      downloadManager.addToQueue({
        ...modData,
        downloads: downloadFiles,
        profileFolder,
        analyticsEntryPoint: entryPoint,
        onStart: () => {
          setModStatus(modData.remoteId, ModStatus.Downloading);
          logger
            .withMetadata({ remoteId: modData.remoteId })
            .info("Started direct download for mod");
        },
        onProgress: (progress) => {
          setModProgress(modData.remoteId, progress);
        },
        onComplete: async (path) => {
          // Set mod as downloaded
          setModStatus(modData.remoteId, ModStatus.Downloaded);

          logger
            .withMetadata({ remoteId: modData.remoteId })
            .info("Download completed, starting auto-installation for mod");
          toast.success(
            `${modData.name} downloaded! Installing automatically...`,
          );

          // Create a local mod object for installation
          const localMod = {
            ...modData,
            path,
            status: ModStatus.Downloaded,
          };

          // Automatically start installation
          try {
            await install(localMod, {
              analyticsEntryPoint: entryPoint,
              onStart: (mod) => {
                setModStatus(mod.remoteId, ModStatus.Installing);
                logger
                  .withMetadata({ remoteId: mod.remoteId })
                  .info("Started auto-installation for mod");
              },
              onComplete: (mod, result) => {
                setModStatus(mod.remoteId, ModStatus.Installed);
                setInstalledVpks(
                  mod.remoteId,
                  result.installed_vpks,
                  result.file_tree,
                );
                toast.success(
                  `${mod.name} installed successfully via 1-click!`,
                );
                logger
                  .withMetadata({ remoteId: mod.remoteId })
                  .info("Auto-installation completed for mod");
                // Remove from processing set when fully complete
                finishOneClickInstall(slug);
              },
              onCancel: (mod) => {
                setModStatus(mod.remoteId, ModStatus.Downloaded);
                finishOneClickInstall(slug);
              },
              onError: (mod, error) => {
                setModStatus(mod.remoteId, ModStatus.Downloaded);
                toast.error(`Failed to install ${mod.name}: ${error.message}`);
                logger
                  .withMetadata({ remoteId: mod.remoteId })
                  .withError(error)
                  .error("Auto-installation failed for mod");
                // Remove from processing set on error
                finishOneClickInstall(slug);
              },
            });
          } catch (error) {
            logger.withError(error).error("Failed to start auto-installation");
            toast.error(
              `Downloaded but failed to install ${modData.name}. You can install it manually.`,
            );
            // Remove from processing set on error
            finishOneClickInstall(slug);
          }
        },
        onError: (error) => {
          if (!(error instanceof DownloadAlreadyQueuedError)) {
            setModStatus(modData.remoteId, ModStatus.FailedToDownload);
          }
          toast.error(`Failed to download ${modData.name}: ${error.message}`);
          logger
            .withMetadata({ remoteId: modData.remoteId })
            .withError(error)
            .error("Direct download failed for mod");
          // Remove from processing set on error
          finishOneClickInstall(slug);
        },
      });
    } catch (error) {
      logger.withError(error).error("Failed to process deep link");
      toast.error(
        "Failed to process 1-click download. The mod may not exist or be unavailable.",
      );
      // Remove from processing set on error
      finishOneClickInstall(slug);
    }
  };

  const handleRef = useRef(handle);
  handleRef.current = handle;

  return useCallback<OneClickInstall>(
    (link, entryPoint) => handleRef.current(link, entryPoint),
    [],
  );
};

export const useDeepLink = (installFromLink: OneClickInstall) => {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        logger.debug("Setting up deep link listener");

        unlisten = await listen<DeepLinkData>("deep-link-received", (event) =>
          installFromLink(event.payload, "deep_link"),
        );
      } catch (error) {
        logger.withError(error).error("Failed to setup deep link listener");
      }
    };

    setupDeepLinkListener();

    // Cleanup function
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [installFromLink]);
};
