import type { ModDto } from '@deadlock-mods/utils';
import { toast } from 'sonner';
import { downloadManager } from '@/lib/download/manager';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';

export const useDownload = (mod: ModDto | undefined) => {
  const { addMod, mods, setModStatus, removeMod, setModPath, setModProgress } =
    usePersistedStore();
  const localMod = mods.find((m) => m.remoteId === mod?.remoteId);

  const downloadMod = async () => {
    if (!mod) {
      toast.error('Failed to fetch mod download data. Try again later.');
      return;
    }

    addMod(mod);

    return downloadManager.addToQueue({
      ...mod,
      onStart: () => setModStatus(mod.remoteId, ModStatus.DOWNLOADING),
      onProgress: (progress) => setModProgress(mod.remoteId, progress),
      onComplete: (path) => {
        setModStatus(mod.remoteId, ModStatus.DOWNLOADED);
        setModPath(mod.remoteId, path);
      },
      onError: () => {
        setModStatus(mod.remoteId, ModStatus.ERROR);
        removeMod(mod.remoteId);
      },
    });
  };

  return {
    download: downloadMod,
    localMod,
  };
};
