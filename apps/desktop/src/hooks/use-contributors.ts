import { useQuery } from "@tanstack/react-query";
import { getContributors } from "@/lib/contributors";
import { GC_TIME_UPDATER, STALE_TIME_UPDATER } from "@/lib/query-constants";

export const useContributors = () =>
  useQuery({
    queryKey: ["github-contributors"],
    queryFn: getContributors,
    staleTime: STALE_TIME_UPDATER,
    gcTime: GC_TIME_UPDATER,
    refetchOnWindowFocus: false,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
