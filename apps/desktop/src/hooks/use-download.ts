import type { ModDownloadDto, ModDto } from '@deadlock-mods/utils';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { toast } from 'sonner';
import { downloadManager } from '@/lib/download/manager';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { type ModDownloadItem, ModStatus } from '@/types/mods';

export const useDownload = (
  mod: Pick<ModDto, 'remoteId' | 'name'> | undefined,
  availableFiles: ModDownloadDto
) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { addLocalMod, localMods, setModPath, setModProgress, setModStatus, setInstalledVpks } =
    usePersistedStore();

  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const downloadSelectedFiles = async (selectedFiles: ModDownloadItem[]) => {
    if (!mod || selectedFiles.length === 0) {
      return;
    }

    addLocalMod(mod as unknown as ModDto); // This is safe and intentional for compatibility with the my mods page

    return downloadManager.addToQueue({
      ...(mod as unknown as ModDto),
      downloads: selectedFiles,
      onStart: () => {
        logger.info('Starting download', { mod: mod.remoteId });
        setModStatus(mod.remoteId, ModStatus.Downloading);
      },
      onProgress: (progress) => {
        setModProgress(mod.remoteId, progress);
      },
      onComplete: async (path) => {
        logger.info('Download complete', { mod: mod.remoteId, path });
        setModPath(mod.remoteId, path);
        setIsDialogOpen(false);
        
        // First set to Downloaded (required by state machine)
        setModStatus(mod.remoteId, ModStatus.Downloaded);
        
        // Then automatically install as disabled after download
        try {
          setModStatus(mod.remoteId, ModStatus.Installing);
          
          const result = await invoke('install_mod', {
            deadlockMod: {
              id: mod.remoteId,
              name: mod.name,
              path: path,
            },
          });
          
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          setInstalledVpks(mod.remoteId, result.installed_vpks);
          toast.success(`${mod.name} downloaded and installed as disabled!`);
        } catch (error) {
          setModStatus(mod.remoteId, ModStatus.Downloaded);
          toast.error(`${mod.name} downloaded but failed to install. You can try installing manually.`);
        }
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
      toast.error('Failed to fetch mod download data. Try again later.');
      return;
    }

    if (!availableFiles || availableFiles.length === 0) {
      toast.error('No downloadable files found for this mod.');
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
