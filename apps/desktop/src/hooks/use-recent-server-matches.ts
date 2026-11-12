import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFeatureEnabled } from "@/hooks/use-feature-enabled";
import { useSelectedSteamAccount } from "@/hooks/use-steam-accounts";
import { STALE_TIME_API } from "@/lib/query-constants";
import { recentMatchesByLocation } from "@/lib/server-picker";
import { getPlayerRegionHistory } from "@/lib/stats/api";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";

/**
 * Where the Stats account's recent matches were played, per picker location.
 * Follows the Stats feature switch, which promises that turning it off
 * stops sending account ids to deadlock-api.
 */
export const useRecentServerMatches = (
  locations: readonly ServerPickerLocation[],
): Map<string, number> | null => {
  const { accountId } = useSelectedSteamAccount();
  const enabled = useFeatureEnabled("stats");
  const { data: history } = useQuery({
    queryKey: ["player-region-history", accountId],
    queryFn:
      !enabled || accountId === null
        ? skipToken
        : () => getPlayerRegionHistory(accountId),
    staleTime: STALE_TIME_API,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  return useMemo(
    () =>
      enabled && history?.length
        ? recentMatchesByLocation(history, locations, new Date())
        : null,
    [enabled, history, locations],
  );
};
