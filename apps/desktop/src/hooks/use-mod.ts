import { useQuery } from 'react-query';
import { getMod } from '@/lib/api';

interface UseModOptions {
  enabled?: boolean;
  suspense?: boolean;
  retry?: number;
}

export const useMod = (
  modId: string | undefined,
  options: UseModOptions = {}
) => {
  const { enabled = true, suspense = true, retry = 1 } = options;

  const query = useQuery({
    queryKey: ['mod', modId],
    queryFn: () => {
      if (!modId) {
        throw new Error('Mod ID is required');
      }
      return getMod(modId);
    },
    enabled: !!modId && !modId?.includes('local') && enabled,
    suspense,
    retry,
  });

  return {
    ...query,
    mod: query.data,
  };
};
