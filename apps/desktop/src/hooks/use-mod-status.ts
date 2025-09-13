import logger from '@/lib/logger';
import { ModStatusStateMachine } from '@/lib/state-machines/mod-status';
import { usePersistedStore } from '@/lib/store';
import type { ModStatus } from '@/types/mods';

export const useModStatus = () => {
  const { setModStatus, localMods } = usePersistedStore();

  return {
    setModStatus: (
      remoteId: string,
      status: ModStatus,
      onError?: (message: string) => void
    ) => {
      const mod = localMods.find((mod) => mod.remoteId === remoteId);
      if (!mod) {
        logger.error('Mod not found', { remoteId });
        onError?.('Mod not found');
        return;
      }
      const validateStatus = ModStatusStateMachine.validateTransition(
        mod.status,
        status
      );
      if (validateStatus.isErr()) {
        logger.error('Invalid status transition', {
          remoteId,
          status,
          error: validateStatus.error,
        });
        onError?.(validateStatus.error.message);
        return;
      }
      logger.info('Updating mod status', { remoteId, status });
      setModStatus(remoteId, status);
    },
  };
};
