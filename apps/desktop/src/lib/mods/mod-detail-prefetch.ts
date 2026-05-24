import type { QueryClient } from "@tanstack/react-query";
import { getMod } from "@/lib/api-client";
import { modDetailQueryKey } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";

export const prefetchModDetail = (
  queryClient: QueryClient,
  remoteId: string,
): Promise<void> => {
  return queryClient.prefetchQuery({
    queryKey: modDetailQueryKey(remoteId),
    queryFn: () => getMod(remoteId),
    staleTime: STALE_TIME_API,
  });
};
