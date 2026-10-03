import type { FeatureFlag } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { getFeatureFlags } from "@/lib/api-client";

/**
 * Server-side flags. Only the `plugin-<id>` kill switches read these now;
 * product features are local toggles (see `useExperimentalFeature`).
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
