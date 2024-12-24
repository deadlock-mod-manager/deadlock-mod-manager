import { useConfirm } from '@/components/providers/alert-dialog';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { LocalMod, ModStatus } from '@/types/mods';
import { toast } from 'sonner';

const useUninstall = () => {
  const confirm = useConfirm();
  const { removeMod } = usePersistedStore();

  const uninstall = async (mod: LocalMod) => {
    try {
      let shouldUninstall = true;
      if (mod.status === ModStatus.INSTALLED) {
        shouldUninstall = !!(await confirm({
          title:
            'Are you sure you want to uninstall this mod? This will disable the mod and remove it from your mods list.',
          body: 'This action cannot be undone.',
          actionButton: 'Uninstall',
          cancelButton: 'Cancel'
        }));
      }
      if (!shouldUninstall) return;

      if (mod.status === ModStatus.INSTALLED) {
        // TODO: await invoke('uninstall_mod', { modId: mod.remoteId });
      }
      await removeMod(mod.remoteId);
      toast.success('Mod removed successfully');
    } catch (error) {
      logger.error(error);
      toast.error('Failed to uninstall mod');
    }
  };

  return { uninstall };
};

export default useUninstall;
