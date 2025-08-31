import { toast } from 'sonner';
import { DataTable } from '@/components/ui/data-table';
import useInstall from '@/hooks/use-install';
import useUninstall from '@/hooks/use-uninstall';
import { createLogger } from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { type LocalMod, ModStatus } from '@/types/mods';
import { createColumns } from './columns';

const logger = createLogger('installation');

export const ModsTable = ({ mods }: { mods: LocalMod[] }) => {
  const { setModStatus, setInstalledVpks } = usePersistedStore();
  const { install } = useInstall();
  const { uninstall } = useUninstall();

  const columns = createColumns(
    install,
    {
      onStart: (mod) => {
        logger.info('Starting installation', { mod: mod.remoteId });
        setModStatus(mod.remoteId, ModStatus.INSTALLING);
      },
      onComplete: (mod, result) => {
        logger.info('Installation complete', {
          mod: mod.remoteId,
          result: result.installed_vpks,
        });
        setInstalledVpks(mod.remoteId, result.installed_vpks);
      },
      onError: (mod, error) => {
        logger.error('Installation error', { mod: mod.remoteId, error });

        switch (error.kind) {
          case 'modAlreadyInstalled':
            setModStatus(mod.remoteId, ModStatus.INSTALLED);
            toast.error(error.message);
            break;
          default:
            setModStatus(mod.remoteId, ModStatus.ERROR);
            toast.error(error.message);
        }
      },
    },
    (mod) => uninstall(mod, true), // Remove
    (mod) => uninstall(mod, false) // Uninstall
  );

  return <DataTable columns={columns} data={mods} />;
};
