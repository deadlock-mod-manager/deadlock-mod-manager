import type { QueryClient } from "@tanstack/react-query";

const MOD_HEALTH_QUERY_KEY = ["mod-health"];

export const modHealthQueryKey = (profileFolder: string | null) => [
  ...MOD_HEALTH_QUERY_KEY,
  profileFolder,
];

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

export const forcedBuildStorageKey = (profileFolder: string | null) =>
  `mod-health.forced-game-build:${profileFolder ?? ""}`;
