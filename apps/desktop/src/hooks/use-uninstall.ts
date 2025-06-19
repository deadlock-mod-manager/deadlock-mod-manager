import { useConfirm } from '@/components/providers/alert-dialog';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { LocalMod, ModStatus } from '@/types/mods';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

const useUninstall = () => {
  const confirm = useConfirm();
  const { removeMod, setModStatus } = usePersistedStore();

  const uninstall = async (mod: LocalMod, remove: boolean) => {
    try {
      let shouldUninstall = true;
      if (mod.status === ModStatus.INSTALLED) {
        shouldUninstall = !!(remove
          ? await confirm({
              title:
                'Are you sure you want to uninstall this mod? This will disable the mod and remove it from your mods list.',
              body: 'This action cannot be undone.',
              actionButton: 'Uninstall',
              cancelButton: 'Cancel'
            })
          : true);
      }
      if (!shouldUninstall) return;

      if (mod.status === ModStatus.INSTALLED) {
        logger.info('Uninstalling mod', { modId: mod.remoteId, vpks: mod.installedVpks });
        if (remove) {
          await invoke('purge_mod', { modId: mod.remoteId, vpks: mod.installedVpks ?? [] });
        } else {
          await invoke('uninstall_mod', { modId: mod.remoteId, vpks: mod.installedVpks ?? [] });
        }
        setModStatus(mod.remoteId, ModStatus.DOWNLOADED);
      }

      if (remove) {
        await removeMod(mod.remoteId);
      }
      toast.success('Mod uninstalled successfully');
    } catch (error) {
      logger.error(error);
      toast.error('Failed to uninstall mod');
    }
  };

  return { uninstall };
};

export default useUninstall;
