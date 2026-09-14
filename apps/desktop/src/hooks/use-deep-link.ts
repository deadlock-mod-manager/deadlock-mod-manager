import { toast } from "@deadlock-mods/ui/components/sonner";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getMod } from "@/lib/api-client";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { serializeSubmissionRef } from "@/lib/mods/submission-ref";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";
import useInstall from "./use-install";

type DeepLinkData = {
  download_url: string;
  mod_type: string;
  mod_id: string;
};

const GAMEBANANA_MMDL_REGEX =
  /^https:\/\/(?:[^/]+\.)?gamebanana\.com\/mmdl\/(\d+)(?:[/?#]|$)/i;

export const useDeepLink = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    addLocalMod: addMod,
    setModStatus,
    setModProgress,
    setInstalledVpks,
    getActiveProfile,
  } = usePersistedStore();
  const { install } = useInstall();
  const processingRef = useRef<Set<string>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: Store functions and navigate are stable, listener should only be set up once
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        logger.debug("Setting up deep link listener");

        unlisten = await listen<DeepLinkData>(
          "deep-link-received",
          async (event) => {
            const { download_url, mod_id, mod_type } = event.payload;
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
            if (processingRef.current.has(slug)) {
              logger
                .withMetadata({ remoteId: slug })
                .warn("Already processing deep link for mod");
              return;
            }

            processingRef.current.add(slug);
            logger
              .withMetadata({ remoteId: slug, fileId })
              .info("Deep link received");

            try {
              // Navigate to the mod page first
              navigate(`/mods/${slug}`);

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
                  .info(
                    "Mod already installed, skipping download and installation",
                  );
                toast.success(`${modData.name} is already installed!`);
                // Just navigate to the mod page to show it's installed
                navigate(`/mods/${slug}`);
                // Remove from processing set since we're done
                processingRef.current.delete(slug);
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
                    .info(
                      "Download completed, starting auto-installation for mod",
                    );
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
                        processingRef.current.delete(slug);
                      },
                      onError: (mod, error) => {
                        setModStatus(mod.remoteId, ModStatus.Downloaded);
                        toast.error(
                          `Failed to install ${mod.name}: ${error.message}`,
                        );
                        logger
                          .withMetadata({ remoteId: mod.remoteId })
                          .withError(error)
                          .error("Auto-installation failed for mod");
                        // Remove from processing set on error
                        processingRef.current.delete(slug);
                      },
                    });
                  } catch (error) {
                    logger
                      .withError(error)
                      .error("Failed to start auto-installation");
                    toast.error(
                      `Downloaded but failed to install ${modData.name}. You can install it manually.`,
                    );
                    // Remove from processing set on error
                    processingRef.current.delete(slug);
                  }
                },
                onError: (error) => {
                  setModStatus(modData.remoteId, ModStatus.FailedToDownload);
                  toast.error(
                    `Failed to download ${modData.name}: ${error.message}`,
                  );
                  logger
                    .withMetadata({ remoteId: modData.remoteId })
                    .withError(error)
                    .error("Direct download failed for mod");
                  // Remove from processing set on error
                  processingRef.current.delete(slug);
                },
              });
            } catch (error) {
              logger.withError(error).error("Failed to process deep link");
              toast.error(
                "Failed to process 1-click download. The mod may not exist or be unavailable.",
              );
              // Remove from processing set on error
              processingRef.current.delete(slug);
            }
          },
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
  }, []);
};
