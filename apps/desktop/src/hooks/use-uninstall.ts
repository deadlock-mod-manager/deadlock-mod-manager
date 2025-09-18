import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useConfirm } from '@/components/providers/alert-dialog';
import logger from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { type LocalMod, ModStatus } from '@/types/mods';

const useUninstall = () => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { removeMod, setModStatus } = usePersistedStore();

  const uninstall = async (mod: LocalMod, remove: boolean) => {
    try {
      let shouldUninstall = true;

      // Only show confirmation dialog when removing (deleting) a mod
      if (remove) {
        shouldUninstall = !!(await confirm({
          title: t('mods.deleteConfirmTitle'),
          body: t('mods.deleteConfirmBody'),
          actionButton: t('mods.deleteConfirmAction'),
          cancelButton: t('mods.deleteConfirmCancel'),
        }));
      }
      // No confirmation dialog for disabling mods

      if (!shouldUninstall) {
        return;
      }

      if (mod.status === ModStatus.Installed) {
        logger.info('Uninstalling mod', {
          modId: mod.remoteId,
          vpks: mod.installedVpks,
        });
        if (remove) {
          await invoke('purge_mod', {
            modId: mod.remoteId,
            vpks: mod.installedVpks ?? [],
          });
        } else {
          // Deactivate the mod (move back to disabled state with _ prefix)
          await invoke('deactivate_mod', {
            modId: mod.remoteId,
            modName: mod.name,
            vpks: mod.installedVpks ?? [],
          });
        }
        setModStatus(mod.remoteId, ModStatus.Downloaded);
      }

      if (remove) {
        // For non-installed mods, we need to delete the folder manually
        if (mod.status !== ModStatus.Installed && mod.path) {
          try {
            await invoke('remove_mod_folder', { modPath: mod.path });
          } catch (error) {
            logger.warn(
              'Failed to remove mod folder, continuing with removal',
              error
            );
          }
        }
        await removeMod(mod.remoteId);
      }
      toast.success(
        remove ? t('mods.deleteSuccess') : t('mods.disableSuccess')
      );
    } catch (error) {
      logger.error(error);
      toast.error(remove ? t('mods.deleteError') : t('mods.disableError'));
    }
  };

  return { uninstall };
};

export default useUninstall;
