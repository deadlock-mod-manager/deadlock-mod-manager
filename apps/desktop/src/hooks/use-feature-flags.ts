import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  deleteFeatureFlagUserOverride,
  getFeatureFlags,
  setFeatureFlagUserOverride,
} from "@/lib/api";
import logger from "@/lib/logger";

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

export const useFeatureFlag = (
  flagName: string,
  defaultValue: boolean = false,
) => {
  const { data: featureFlags, ...rest } = useFeatureFlags();

  const flag = featureFlags?.find((flag) => flag.name === flagName);
  const isEnabled = flag?.enabled ?? defaultValue;

  return {
    isEnabled,
    flag,
    ...rest,
  };
};

export const useFeatureFlagMutation = () => {
  const queryClient = useQueryClient();

  const setOverride = useMutation({
    mutationFn: ({ flagId, value }: { flagId: string; value: unknown }) =>
      setFeatureFlagUserOverride(flagId, value),
    onSuccess: () => {
      queryClient.invalidateQueries(["feature-flags"]);
    },
    onError: (error) => {
      logger.error("Failed to set feature flag override", error);
    },
  });

  const deleteOverride = useMutation({
    mutationFn: (flagId: string) => deleteFeatureFlagUserOverride(flagId),
    onSuccess: () => {
      queryClient.invalidateQueries(["feature-flags"]);
    },
    onError: (error) => {
      logger.error("Failed to delete feature flag override", error);
    },
  });

  const toggleFlag = async (flagId: string, currentValue: unknown) => {
    if (typeof currentValue === "boolean") {
      return setOverride.mutateAsync({ flagId, value: !currentValue });
    }
    throw new Error("Can only toggle boolean flags");
  };

  return {
    setOverride: setOverride.mutateAsync,
    deleteOverride: deleteOverride.mutateAsync,
    toggleFlag,
    isSettingOverride: setOverride.isLoading,
    isDeletingOverride: deleteOverride.isLoading,
  };
};
