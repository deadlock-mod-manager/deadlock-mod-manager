import type { ModDto } from "@deadlock-mods/shared";
import { resolveDetectedHeroLabel } from "@deadlock-mods/hero-parser";
import type { z } from "zod";
import { ModDownloadDtoSchema } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { detectHeroForMod } from "@/hooks/use-hero-detection";
import { downloadManager } from "@/lib/download/manager";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type ModDownloadItem, ModStatus } from "@/types/mods";

type ModDownloadDto = z.infer<typeof ModDownloadDtoSchema>;

export const useDownload = (
  mod: Pick<ModDto, "remoteId" | "name"> | undefined,
  availableFiles: ModDownloadDto[],
) => {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const addLocalMod = usePersistedStore((state) => state.addLocalMod);
  const localMods = usePersistedStore((state) => state.localMods);
  const setModProgress = usePersistedStore((state) => state.setModProgress);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const setDetectedHero = usePersistedStore((state) => state.setDetectedHero);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);

  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const downloadSelectedFiles = async (selectedFiles: ModDownloadItem[]) => {
    if (!mod || selectedFiles.length === 0) {
      return;
    }

    addLocalMod(mod as unknown as ModDto, {
      downloads: availableFiles,
      selectedDownloads: selectedFiles,
    });

    const activeProfile = getActiveProfile();
    const profileFolder = activeProfile?.folderName ?? null;

    return downloadManager.addToQueue({
      ...(mod as unknown as ModDto),
      downloads: selectedFiles,
      profileFolder,
      onStart: () => {
        logger.withMetadata({ mod: mod.remoteId }).info("Starting download");
        setModStatus(mod.remoteId, ModStatus.Downloading);
      },
      onProgress: (progress) => {
        setModProgress(mod.remoteId, progress);
      },
      onComplete: (path) => {
        logger
          .withMetadata({ mod: mod.remoteId, path })
          .info("Download complete");
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        setIsDialogOpen(false);
        toast.success(`${mod.name} downloaded!`);

        detectHeroForMod(mod.remoteId)
          .then((result) => {
            setDetectedHero(
              mod.remoteId,
              resolveDetectedHeroLabel(result),
              result.usesCriticalPaths,
            );
          })
          .catch((err) => {
            logger
              .withMetadata({ mod: mod.remoteId })
              .withError(err instanceof Error ? err : new Error(String(err)))
              .warn("Failed to detect hero after download");
          });
      },
      onError: (error) => {
        toast.error(`Failed to download ${mod.name}: ${error.message}`);
        setModStatus(mod.remoteId, ModStatus.FailedToDownload);
        setIsDialogOpen(false);
      },
    });
  };

  const initiateDownload = () => {
    if (!mod) {
      toast.error("Failed to fetch mod download data. Try again later.");
      return;
    }

    if (!availableFiles || availableFiles.length === 0) {
      toast.error("No downloadable files found for this mod.");
      return;
    }

    // If only one file, download directly without showing dialog
    if (availableFiles.length === 1) {
      return downloadSelectedFiles(availableFiles);
    }

    // Multiple files - show selection dialog
    setIsDialogOpen(true);
  };

  const pauseDownload = () => {
    if (mod) {
      downloadManager.pauseDownload(mod.remoteId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Could not pause download: ${message}`);
      });
    }
  };

  const resumeDownload = () => {
    if (mod) {
      downloadManager.resumeDownload(mod.remoteId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Could not resume download: ${message}`);
      });
    }
  };

  /**
   * Starts the download over from nothing. What a failed attempt leaves on disk
   * - a truncated archive, a stale `.partial`, a half-extracted folder - is what
   * makes a plain re-queue fail in the same place again, which is why the way
   * out used to be deleting the mod and downloading it a second time. The store
   * entry stays, so the file selection and the mod's place in the library do too.
   *
   * The exception is a mod that already has files in the game: that is a failed
   * update, and clearing the slate there would take the working version with it.
   * Those retry the way they always have, on top of what is installed.
   */
  const retryDownload = async () => {
    if (!mod) {
      toast.error(t("downloads.retryFetchError"));
      return;
    }

    const selectedDownloads = localMod?.selectedDownloads ?? [];
    const persistedDownloads = localMod?.downloads ?? [];

    const retryFiles =
      selectedDownloads.length > 0
        ? selectedDownloads
        : persistedDownloads.length > 0
          ? persistedDownloads
          : availableFiles;

    if (retryFiles.length === 0) {
      toast.error(t("downloads.retryNoFiles"));
      return;
    }

    setModStatus(mod.remoteId, ModStatus.Downloading);
    try {
      if ((localMod?.installedVpks?.length ?? 0) === 0) {
        await invoke("purge_mod", {
          modId: mod.remoteId,
          vpks: [],
          profileFolder: getActiveProfile()?.folderName ?? null,
        });
      }
      await downloadSelectedFiles(retryFiles);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      logger
        .withMetadata({ mod: mod.remoteId })
        .withError(err instanceof Error ? err : new Error(message))
        .error("Failed to retry download");
      setModStatus(mod.remoteId, ModStatus.FailedToDownload);
      toast.error(t("downloads.retryError", { message }));
    }
  };

  return {
    download: initiateDownload,
    retryDownload,
    downloadSelectedFiles,
    pauseDownload,
    resumeDownload,
    closeDialog: () => setIsDialogOpen(false),
    localMod,
    isDialogOpen,
  };
};
