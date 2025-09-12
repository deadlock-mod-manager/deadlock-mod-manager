import type { ModDownloadDto, ModDto } from '@deadlock-mods/utils';
import { useState } from 'react';
import { toast } from 'sonner';
import { downloadManager } from '@/lib/download/manager';
import { usePersistedStore } from '@/lib/store';
import { type ModDownloadItem, ModStatus } from '@/types/mods';

export const useMultiFileDownload = (
  mod: ModDto | undefined,
  availableFiles: ModDownloadDto
) => {
  const { addMod, mods, setModStatus, removeMod, setModPath, setModProgress } =
    usePersistedStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const localMod = mods.find((m) => m.remoteId === mod?.remoteId);

  const initiateDownload = () => {
    if (!mod) {
      toast.error('Failed to fetch mod download data. Try again later.');
      return;
    }

    if (!availableFiles || availableFiles.length === 0) {
      toast.error('No downloadable files found for this mod.');
      return;
    }

    // If only one file, download directly without showing dialog
    if (availableFiles.length === 1) {
      downloadSelectedFiles(availableFiles);
      return;
    }

    // Multiple files - show selection dialog
    setIsDialogOpen(true);
  };

  const downloadSelectedFiles = async (selectedFiles: ModDownloadItem[]) => {
    if (!mod || selectedFiles.length === 0) {
      return;
    }

    addMod(mod);

    return downloadManager.addToQueue({
      ...mod,
      downloads: selectedFiles,
      onStart: () => setModStatus(mod.remoteId, ModStatus.Downloading),
      onProgress: (progress) => setModProgress(mod.remoteId, progress),
      onComplete: (path) => {
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        setModPath(mod.remoteId, path);
        setIsDialogOpen(false);
      },
      onError: () => {
        setModStatus(mod.remoteId, ModStatus.Error);
        removeMod(mod.remoteId);
        setIsDialogOpen(false);
      },
    });
  };

  const closeDialog = () => {
    if (mod) {
      removeMod(mod.remoteId);
    }
    setIsDialogOpen(false);
  };

  return {
    download: initiateDownload,
    downloadSelectedFiles,
    closeDialog,
    localMod,
    isDialogOpen,
  };
};
