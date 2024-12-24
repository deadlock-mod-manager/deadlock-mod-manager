import { DataTable } from '@/components/ui/data-table';
import useInstall from '@/hooks/use-install';
import { createLogger } from '@/lib/logger';
import { usePersistedStore } from '@/lib/store';
import { LocalMod, ModStatus } from '@/types/mods';
import { toast } from 'sonner';
import { createColumns } from './columns';

const logger = createLogger('installation');

export const ModsTable = ({ mods }: { mods: LocalMod[] }) => {
  const { setModStatus } = usePersistedStore();
  const { install } = useInstall();

  const columns = createColumns(install, {
    onStart: (mod) => {
      logger.info('Starting installation', { mod });
      setModStatus(mod.remoteId, ModStatus.INSTALLING);
    },
    onComplete: (mod, result) => {
      logger.info('Installation complete', { mod, result });
      setModStatus(mod.remoteId, ModStatus.INSTALLED);
    },
    onError: (mod, error) => {
      logger.error('Installation error', { mod, error });

      switch (error.kind) {
        case 'modAlreadyInstalled':
          setModStatus(mod.remoteId, ModStatus.INSTALLED);
          toast.error(error.message);
          break;
        default:
          setModStatus(mod.remoteId, ModStatus.ERROR);
          toast.error(error.message);
      }
    }
  });

  return <DataTable columns={columns} data={mods} />;
};
