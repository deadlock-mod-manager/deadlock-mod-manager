import type { ModDownloadDto, ModDto } from '@deadlock-mods/utils';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { downloadManager } from '@/lib/download/manager';
import { usePersistedStore } from '@/lib/store';
import { type ModDownloadItem, ModStatus } from '@/types/mods';
import { useModStatus } from './use-mod-status';

export const useDownload = (
  mod: ModDto | undefined,
  availableFiles: ModDownloadDto
) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { addLocalMod, localMods, setModPath, setModProgress } =
    usePersistedStore();
  const { setModStatus } = useModStatus();

  const localMod = useMemo(
    () => localMods.find((m) => m.remoteId === mod?.remoteId),
    [localMods, mod]
  );

  const downloadSelectedFiles = useCallback(
    async (selectedFiles: ModDownloadItem[]) => {
      if (!mod || selectedFiles.length === 0) {
        return;
      }

      // Add the mod to the local store.
      addLocalMod(mod);

      return downloadManager.addToQueue({
        ...mod,
        downloads: selectedFiles,
        onStart: () => setModStatus(mod.remoteId, ModStatus.Downloading),
        onProgress: (progress) => setModProgress(mod.remoteId, progress),
        onComplete: (path) => {
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          setModPath(mod.remoteId, path);
          setIsDialogOpen(false);
          toast.success(`${mod.name} downloaded!`);
        },
        onError: (error) => {
          toast.error(`Failed to download ${mod.name}: ${error.message}`);
          setModStatus(mod.remoteId, ModStatus.FailedToDownload);
          setIsDialogOpen(false);
        },
      });
    },
    [mod, addLocalMod, setModStatus, setModPath, setModProgress]
  );

  const initiateDownload = useCallback(() => {
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
  }, [mod, availableFiles, downloadSelectedFiles]);

  return {
    download: initiateDownload,
    downloadSelectedFiles,
    closeDialog: () => setIsDialogOpen(false),
    localMod,
    isDialogOpen,
  };
};
