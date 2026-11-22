import type { FeatureFlag } from "@deadlock-mods/shared";
import { useQuery } from "@tanstack/react-query";
import { getFeatureFlags } from "@/lib/api-client";

export const useFeatureFlags = () => {
  return useQuery<FeatureFlag[]>({
    queryKey: ["feature-flags"],
    queryFn: getFeatureFlags,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 3,
    meta: { skipGlobalErrorHandler: true },
  });
};
