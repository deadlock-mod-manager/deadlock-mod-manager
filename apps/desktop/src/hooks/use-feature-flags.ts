import { useQuery } from "react-query";
import { getFeatureFlags } from "@/lib/api";
import logger from "@/lib/logger";

export interface FeatureFlag {
  name: string;
  enabled: boolean;
}

export const useFeatureFlags = () => {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: getFeatureFlags,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 15 * 60 * 1000, // 15 minutes
    retry: 3,
    onError: (error) => {
      logger.error("Failed to fetch feature flags from API", error);
    },
  });
};

export const useFeatureFlag = (flagName: string) => {
  const { data: featureFlags, ...rest } = useFeatureFlags();

  const flag = featureFlags?.find((flag) => flag.name === flagName);
  const isEnabled = flag?.enabled ?? false;

  return {
    isEnabled,
    flag,
    ...rest,
  };
};
