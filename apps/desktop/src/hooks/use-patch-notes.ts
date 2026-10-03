import { useQuery } from "@tanstack/react-query";
import { STALE_TIME_UPDATER } from "@/lib/query-constants";
import { getPatchNotes } from "@/lib/steam-news";

export const usePatchNotes = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: ["steam-patch-notes"],
    queryFn: () => getPatchNotes(),
    enabled,
    staleTime: STALE_TIME_UPDATER,
    refetchOnWindowFocus: false,
    // The dashboard shows its own inline retry; a toast on every launch
    // while Steam is down would be noise.
    meta: { skipGlobalErrorHandler: true },
  });
