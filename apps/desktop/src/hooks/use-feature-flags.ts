import type { FeatureFlag } from "@deadlock-mods/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteFeatureFlagUserOverride,
  getFeatureFlags,
  setFeatureFlagUserOverride,
} from "@/lib/api-client";
import logger from "@/lib/logger";

const DEV_ALWAYS_ON_FLAGS = new Set(["custom-maps", "server-browser"]);

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

export const useFeatureFlag = (
  flagName: string,
  defaultValue: boolean = false,
) => {
  const { data: featureFlags, ...rest } = useFeatureFlags();

  const flag = featureFlags?.find((flag) => flag.name === flagName);
  const fromApi = flag?.enabled ?? defaultValue;
  const isEnabled =
    import.meta.env.DEV && DEV_ALWAYS_ON_FLAGS.has(flagName) ? true : fromApi;

  return {
    ...rest,
    isEnabled,
    flag,
  };
};

/**
 * The Stats page ships on, so it is the one flag that fails *open*: an
 * unreachable flag service leaves the page enabled rather than hiding a shipped
 * feature every time the backend hiccups. Turning it off remotely therefore
 * needs a flag response that actually arrives - which is the right trade for a
 * page whose own data comes from a third party and degrades on its own.
 *
 * One helper so the three call sites cannot drift on that default.
 */
export const usePlayerStatsEnabled = () => useFeatureFlag("player-stats", true);

export const useFeatureFlagMutation = () => {
  const queryClient = useQueryClient();

  const setOverride = useMutation({
    mutationFn: ({ flagId, value }: { flagId: string; value: unknown }) =>
      setFeatureFlagUserOverride(flagId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (error) => {
      logger.withError(error).error("Failed to set feature flag override");
    },
  });

  const deleteOverride = useMutation({
    mutationFn: (flagId: string) => deleteFeatureFlagUserOverride(flagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
    onError: (error) => {
      logger.withError(error).error("Failed to delete feature flag override");
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
