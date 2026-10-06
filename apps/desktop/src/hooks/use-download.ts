import type { ModDto } from "@deadlock-mods/shared";
import { resolveDetectedHeroLabel } from "@deadlock-mods/hero-parser";
import type { z } from "zod";
import { ModDownloadDtoSchema } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { useLocation } from "react-router";
import { getModEntryPoint } from "@/lib/analytics";
import {
  modEntryPoint,
  type AnalyticsEntryPoint,
} from "@/lib/analytics/client";
import { useTranslation } from "react-i18next";
import { detectHeroForMod } from "@/hooks/use-hero-detection";
import { downloadManager } from "@/lib/download/manager";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { type ModDownloadItem, ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

type ModDownloadDto = z.infer<typeof ModDownloadDtoSchema>;

type QueueModDownloadOptions = {
  /** Every file the mod offers, kept so the selection can be changed later. */
  allFiles: ModDownloadItem[];
  profileFolder: string | null;
  analyticsEntryPoint?: AnalyticsEntryPoint;
  analyticsOperationKind?: "download" | "retry";
  onComplete?: () => void;
  onError?: (error: Error) => void;
};

/**
 * Adds a mod to the library and queues its selected files. Library status,
 * progress, and hero detection follow the download; callers only add their
 * own feedback.
 */
export const queueModDownload = (
  mod: ModDto,
  selectedFiles: ModDownloadItem[],
  {
    allFiles,
    profileFolder,
    onComplete,
    onError,
    analyticsEntryPoint,
    analyticsOperationKind,
  }: QueueModDownloadOptions,
) => {
  const { addLocalMod, setModStatus, setModProgress, setDetectedHero } =
    usePersistedStore.getState();

  addLocalMod(mod, { downloads: allFiles, selectedDownloads: selectedFiles });

  return downloadManager.addToQueue({
    ...mod,
    downloads: selectedFiles,
    profileFolder,
    analyticsEntryPoint,
    analyticsOperationKind,
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
      onComplete?.();

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
      setModStatus(mod.remoteId, ModStatus.FailedToDownload);
      onError?.(error);
    },
  });
};

export const useDownload = (
  mod: ModDto | undefined,
  availableFiles: ModDownloadDto[],
) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setModStatus = usePersistedStore((state) => state.setModStatus);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);

  const localMod = usePersistedStore((state) =>
    findLocalMod(state.localMods, mod?.remoteId),
  );

  const downloadSelectedFiles = async (
    selectedFiles: ModDownloadItem[],
    /**
     * The retry path pins the profile it cleaned up for: switching profiles
     * while the purge runs would otherwise queue the download into a folder
     * that was never cleared.
     */
    pinnedProfileFolder?: string | null,
    allFiles: ModDownloadDto[] = availableFiles,
    operationKind: "download" | "retry" = "download",
  ) => {
    if (!mod || selectedFiles.length === 0) {
      return;
    }

    const profileFolder =
      pinnedProfileFolder === undefined
        ? (getActiveProfile()?.folderName ?? null)
        : pinnedProfileFolder;

    return queueModDownload(mod, selectedFiles, {
      allFiles,
      profileFolder,
      analyticsOperationKind: operationKind,
      analyticsEntryPoint: getModEntryPoint(
        mod.remoteId,
        modEntryPoint(
          pathname,
          !!usePersistedStore.getState().modsFilters.searchQuery,
        ),
      ),
      onComplete: () => {
        setIsDialogOpen(false);
        toast.success(`${mod.name} downloaded!`);
      },
      onError: (error) => {
        toast.error(`Failed to download ${mod.name}: ${error.message}`);
        setIsDialogOpen(false);
      },
    });
  };

  /**
   * `files` lets callers that fetch the file list on click pass it straight
   * through, since the hook's `availableFiles` only catches up on the next render.
   */
  const initiateDownload = (files: ModDownloadDto[] = availableFiles) => {
    if (!mod) {
      toast.error("Failed to fetch mod download data. Try again later.");
      return;
    }

    if (!files || files.length === 0) {
      toast.error("No downloadable files found for this mod.");
      return;
    }

    // If only one file, download directly without showing dialog
    if (files.length === 1) {
      return downloadSelectedFiles(files, undefined, files);
    }

    // Multiple files - show selection dialog
    setIsDialogOpen(true);
  };

  const pauseDownload = () => {
    if (mod) {
      downloadManager.pauseDownload(mod.remoteId).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Could not pause download: ${message}`);
      });
    }
  };

  const resumeDownload = () => {
    if (mod) {
      downloadManager.resumeDownload(mod.remoteId).catch((err) => {
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
   *
   * `loadFallbackFiles` is only called when the mod has no persisted file
   * selection, so callers can defer a network fetch until it is needed.
   */
  const retryDownload = async (
    loadFallbackFiles: () => Promise<ModDownloadDto[]> = async () =>
      availableFiles,
  ) => {
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
          : await loadFallbackFiles();

    if (retryFiles.length === 0) {
      toast.error(t("downloads.retryNoFiles"));
      return;
    }

    setModStatus(mod.remoteId, ModStatus.Downloading);
    const profileFolder = getActiveProfile()?.folderName ?? null;
    try {
      if ((localMod?.installedVpks?.length ?? 0) === 0) {
        await invokeGuarded("purge_mod", {
          modId: mod.remoteId,
          vpks: [],
          profileFolder,
        });
      }
      await downloadSelectedFiles(
        retryFiles,
        profileFolder,
        availableFiles,
        "retry",
      );
    } catch (err) {
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
