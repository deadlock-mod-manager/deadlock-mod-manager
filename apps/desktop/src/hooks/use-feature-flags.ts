import type { FeatureFlag } from "@deadlock-mods/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  deleteFeatureFlagUserOverride,
  getFeatureFlags,
  setFeatureFlagUserOverride,
} from "@/lib/api-client";
import logger from "@/lib/logger";
import {
  setGameBananaDirectClientEnabled,
  synchronizeGameBananaCatalog,
} from "@/lib/gamebanana-catalog";

const DEV_ALWAYS_ON_FLAGS = new Set([
  "custom-maps",
  "server-browser",
  "mod-foundry",
]);

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
  const fromApi =
    typeof flag?.enabled === "boolean" ? flag.enabled : defaultValue;
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

export const useGameBananaDirectClient = () => {
  const queryClient = useQueryClient();
  const previousEnabled = useRef(false);
  const flag = useFeatureFlag("gamebanana-direct-client", false);
  const synchronizeCatalog = useMutation({
    mutationFn: synchronizeGameBananaCatalog,
    meta: { skipGlobalErrorHandler: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
    },
    onError: (error) => {
      logger.withError(error).warn("GameBanana catalog refresh failed");
    },
  });

  useEffect(() => {
    if (!flag.isFetched) return;
    setGameBananaDirectClientEnabled(flag.isEnabled);
    if (previousEnabled.current !== flag.isEnabled) {
      previousEnabled.current = flag.isEnabled;
      void queryClient.invalidateQueries({ queryKey: ["mods"] });
      void queryClient.invalidateQueries({ queryKey: ["mod"] });
      if (flag.isEnabled) {
        synchronizeCatalog.mutate();
      }
    }
  }, [flag.isEnabled, flag.isFetched, queryClient, synchronizeCatalog.mutate]);

  return flag;
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
