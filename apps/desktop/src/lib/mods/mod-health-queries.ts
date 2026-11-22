import type { QueryClient } from "@tanstack/react-query";

const MOD_HEALTH_QUERY_KEY = ["mod-health"];

export const modHealthQueryKey = (profileFolder: string | null) => [
  ...MOD_HEALTH_QUERY_KEY,
  profileFolder,
];

/**
 * Refreshes everything derived from the compatibility state of a profile. The
 * review analysis rebuilds the whole repair plan, so it is only marked stale
 * and runs again when the review next opens.
 */
export const invalidateModHealth = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: MOD_HEALTH_QUERY_KEY }),
    queryClient.invalidateQueries({
      queryKey: ["mod-compatibility-analysis"],
      refetchType: "none",
    }),
    queryClient.invalidateQueries({
      queryKey: ["mod-compatibility-resolved-analysis"],
      refetchType: "none",
    }),
  ]);

/**
 * Remembers, per profile, the game build whose forced recheck succeeded.
 * previousGameBuild still names the old build after that recheck, so this
 * stops it from repeating on every start.
 */
export const forcedBuildStorageKey = (profileFolder: string | null) =>
  `mod-health.forced-game-build:${profileFolder ?? ""}`;
