import { useInfiniteQuery } from "@tanstack/react-query";
import { getGameBananaChangelog } from "@/lib/gamebanana-catalog";
import { STALE_TIME_API } from "@/lib/query-constants";

export const modChangelogQueryKey = (remoteId: string) =>
  ["mod-changelog", remoteId] as const;

export const useModChangelog = (remoteId: string | undefined) =>
  useInfiniteQuery({
    queryKey: modChangelogQueryKey(remoteId ?? ""),
    queryFn: ({ pageParam }) => {
      if (!remoteId) {
        throw new Error("Mod ID is required");
      }
      return getGameBananaChangelog(remoteId, pageParam);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: !!remoteId && !remoteId.includes("local"),
    staleTime: STALE_TIME_API,
    retry: 1,
  });
