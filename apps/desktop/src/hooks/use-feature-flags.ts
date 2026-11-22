import type { FeatureFlag } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { getFeatureFlags } from "@/lib/api-client";

/**
 * Server-side plugin kill switches and release themes.
 * Experimental product features use local toggles.
 */
export const useFeatureFlags = () => {
  return useQuery<FeatureFlag[]>({
    queryKey: ["feature-flags"],
    queryFn: getFeatureFlags,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 3,
    meta: { skipGlobalErrorHandler: true },
  });
};
