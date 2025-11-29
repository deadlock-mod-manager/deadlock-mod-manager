import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 3,
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
    ...rest,
    isEnabled,
    flag,
  };
};

export const useFeatureFlagMutation = () => {
  const queryClient = useQueryClient();

  const setOverride = useMutation({
    mutationFn: ({ flagId, value }: { flagId: string; value: unknown }) =>
      setFeatureFlagUserOverride(flagId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (error) => {
      logger.error("Failed to set feature flag override", error);
    },
  });

  const deleteOverride = useMutation({
    mutationFn: (flagId: string) => deleteFeatureFlagUserOverride(flagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
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
    isSettingOverride: setOverride.isPending,
    isDeletingOverride: deleteOverride.isPending,
  };
};
