import type { ModDownloadDto, ModDto } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useState } from "react";
import { downloadManager } from "@/lib/download/manager";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { type ModDownloadItem, ModStatus } from "@/types/mods";

export const useDownload = (
  mod: Pick<ModDto, "remoteId" | "name"> | undefined,
  availableFiles: ModDownloadDto,
) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const {
    addLocalMod,
    localMods,
    setModProgress,
    setModStatus,
    getActiveProfile,
  } = usePersistedStore();

  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const downloadSelectedFiles = async (selectedFiles: ModDownloadItem[]) => {
    if (!mod || selectedFiles.length === 0) {
      return;
    }

    addLocalMod(mod as unknown as ModDto, { downloads: selectedFiles });

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

  return {
    download: initiateDownload,
    downloadSelectedFiles,
    closeDialog: () => setIsDialogOpen(false),
    localMod,
    isDialogOpen,
  };
};
