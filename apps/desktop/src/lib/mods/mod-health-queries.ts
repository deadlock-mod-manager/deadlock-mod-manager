import type { QueryClient } from "@tanstack/react-query";

const MOD_HEALTH_QUERY_KEY = ["mod-health"];

export const modHealthQueryKey = (profileFolder: string | null) => [
  ...MOD_HEALTH_QUERY_KEY,
  profileFolder,
];

/** Refreshes everything derived from the compatibility state of a profile. */
export const invalidateModHealth = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: MOD_HEALTH_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ["mod-compatibility-analysis"] }),
    queryClient.invalidateQueries({
      queryKey: ["mod-compatibility-resolved-analysis"],
    }),
  ]);
