import { useQuery } from 'react-query';
import { getModDownloads } from '@/lib/api';

interface UseModDownloadsOptions {
  /**
   * The remote ID of the mod to fetch downloads for
   */
  remoteId?: string;
  /**
   * Whether the mod is downloadable - used to conditionally enable the query
   */
  isDownloadable?: boolean;
  /**
   * Whether to enable the query (overrides other conditions if false)
   */
  enabled?: boolean;
}

/**
 * Hook to fetch mod downloads with proper React Query caching
 *
 * @param options Configuration options for the hook
 * @returns Query result with downloads data and loading state
 */
export const useModDownloads = ({
  remoteId,
  isDownloadable = true,
  enabled = true,
}: UseModDownloadsOptions) => {
  const query = useQuery({
    queryKey: ['mod-downloads', remoteId],
    queryFn: () => {
      if (!remoteId) {
        throw new Error('Mod remote ID is required');
      }
      return getModDownloads(remoteId);
    },
    enabled: enabled && !!remoteId && isDownloadable,
    // Cache for 5 minutes to reduce unnecessary requests
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 10 minutes after component unmounts
    cacheTime: 10 * 60 * 1000,
    // Retry failed requests up to 2 times
    retry: 2,
  });

  return {
    ...query,
    availableFiles: query.data?.downloads ?? [],
    downloadCount: query.data?.count ?? 0,
  };
};
