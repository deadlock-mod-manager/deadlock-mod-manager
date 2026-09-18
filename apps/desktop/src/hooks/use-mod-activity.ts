import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getGameBananaChangelog,
  getGameBananaComments,
} from "@/lib/gamebanana-catalog";
import { STALE_TIME_API } from "@/lib/query-constants";

const useActivityPages = <TPage extends { page: number; hasMore: boolean }>(
  key: string,
  remoteId: string,
  fetchPage: (remoteId: string, page: number) => Promise<TPage>,
) =>
  useInfiniteQuery({
    queryKey: [key, remoteId],
    queryFn: ({ pageParam }) => fetchPage(remoteId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: STALE_TIME_API,
    retry: 1,
  });

export const useModComments = (remoteId: string) =>
  useActivityPages("mod-comments", remoteId, getGameBananaComments);

export const useModChangelog = (remoteId: string) =>
  useActivityPages("mod-changelog", remoteId, getGameBananaChangelog);
