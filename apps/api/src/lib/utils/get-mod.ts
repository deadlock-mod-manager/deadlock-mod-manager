import type { GameBanana } from '@deadlock-mods/utils';
import { providerRegistry } from '../providers';

export const getMod = async <T = GameBanana.GameBananaModDownload>(
  remoteId: string,
  providerName = 'gamebanana'
): Promise<T> => {
  const provider = providerRegistry.getProvider<T>(providerName);
  return provider.getModDownload<T>(remoteId);
};
