import { ModStatusStateMachine } from '@/lib/state-machines/mod-status';
import { usePersistedStore } from '@/lib/store';
import type { ModStatus } from '@/types/mods';

export const useModStatus = () => {
  const { setModStatus, localMods: mods } = usePersistedStore();

  return {
    setModStatus: (
      remoteId: string,
      status: ModStatus,
      onError?: (message: string) => void
    ) => {
      const mod = mods.find((mod) => mod.remoteId === remoteId);
      if (!mod) {
        onError?.('Mod not found');
        return;
      }
      const validateStatus = ModStatusStateMachine.validateTransition(
        mod.status,
        status
      );
      if (validateStatus.isErr()) {
        onError?.(validateStatus.error.message);
        return;
      }
      setModStatus(remoteId, status);
    },
  };
};
