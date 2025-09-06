
import type { ModDto } from '@deadlock-mods/utils';
import { useQuery } from 'react-query';
import { toast } from 'sonner';
import { getModDownloads } from '@/lib/api';
import { createLogger } from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import type { LocalMod } from '@/types/mods';
import { ModStatus } from '@/types/mods';
import type { InstallWithCollectionFunction } from './use-install-with-collection';
import { useMultiFileDownload } from './use-multi-file-download';
import useUninstall from './use-uninstall';

const logger = createLogger('mod-update');

export interface UseUpdateModReturn {
  update: (
    mod: LocalMod,
    install: InstallWithCollectionFunction,
    downloadFn?: (() => void) | undefined
  ) => Promise<void>;
  isUpdating: (mod: LocalMod) => boolean;
}

export const useUpdateMod = (mod: ModDto): UseUpdateModReturn => {
  const { setModStatus } = usePersistedStore();
  const { uninstall } = useUninstall();
  const { data: downloadData } = useQuery({
    queryKey: ['mod-downloads', mod?.remoteId],
    queryFn: () => {
      if (!mod?.remoteId) {
        throw new Error('Mod ID is required');
      }
      return getModDownloads(mod.remoteId);
    },
    enabled: !!mod?.remoteId && !!mod?.downloadable,
  });

  const availableFiles = downloadData?.downloads ?? [];

  const { download } = useMultiFileDownload(mod, availableFiles);

  const isUpdating = (mod: LocalMod): boolean => {
    return (
      mod.status === ModStatus.INSTALLING ||
      mod.status === ModStatus.DOWNLOADING
    );
  };

  const update = async (mod: LocalMod): Promise<void> => {
    if (isUpdating(mod)) {
      logger.warn('Mod is already updating', { modId: mod.remoteId });
      return;
    }

    if (mod.status !== ModStatus.INSTALLED) {
      logger.warn('Cannot update mod that is not installed', {
        modId: mod.remoteId,
      });
      toast.error('Mod is not installed');
      return;
    }

    try {
      logger.info('Starting mod update', { modId: mod.remoteId });

      // First uninstall the current version
      logger.info('Uninstalling current version', { modId: mod.remoteId });
      await uninstall(mod, false);

      download();
    } catch (error) {
      logger.error('Update failed', { modId: mod.remoteId, error });
      setModStatus(mod.remoteId, ModStatus.ERROR);
      toast.error(`Failed to update ${mod.name}`);
    }
  };

  return {
    update,
    isUpdating,
  };
};

export default useUpdateMod;
