import { useInfiniteQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { archiveContentSearchPhase } from "@/lib/archive-content-search";
import type { ModdingContentSearchPage } from "@/types/generated/ModdingContentSearchPage";
import type { ModdingContentSearchRequest } from "@/types/generated/ModdingContentSearchRequest";

export type ArchiveContentQuery = Omit<
  ModdingContentSearchRequest,
  "cursor"
> & { id: string };

export function useArchiveContentSearch(
  archivePath: string,
  request: ArchiveContentQuery | null,
) {
  const [pausedRequest, setPausedRequest] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["workbench-archive-contents", archivePath, request],
    queryFn: ({ pageParam }) =>
      invoke<ModdingContentSearchPage>("search_modding_archive_contents", {
        archivePath,
        request: { ...request, cursor: pageParam },
      }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: request !== null,
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
    refetchOnReconnect: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const phase = archiveContentSearchPhase({
    submitted: request !== null,
    paused: request !== null && pausedRequest === request.id,
    pending: query.isPending,
    failed: query.isError,
    hasMore: !!query.hasNextPage,
    matchingFiles:
      query.data?.pages.reduce((sum, page) => sum + page.files.length, 0) ?? 0,
  });
  const { fetchNextPage, hasNextPage, isFetching } = query;
  useEffect(() => {
    if (phase === "searching" && hasNextPage && !isFetching) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [phase, hasNextPage, isFetching, fetchNextPage]);
  return {
    ...query,
    phase,
    pause: () => setPausedRequest(request?.id ?? null),
    resume: () => setPausedRequest(null),
  };
}
