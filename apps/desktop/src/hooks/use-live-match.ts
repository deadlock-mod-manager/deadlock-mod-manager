import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo } from "react";
import { useGameRunning } from "@/hooks/use-mod-health";
import {
  type SoulsPoint,
  soulsTrailOf,
  useLiveSession,
} from "@/lib/stats/live-session";
import { type LiveBoard, liveBoard } from "@/lib/stats/live-view";
import type { LiveMatchStatus } from "@/types/generated/LiveMatchStatus";

/**
 * Matches the game logged that the API's history does not contain. A non-empty
 * result means the page is showing an incomplete picture of today.
 */
export const useMissingLocalMatches = (
  apiMatchIds: number[],
  enabled: boolean,
) => {
  const detection = useLiveMatchDetection(enabled);

  return useMemo(() => {
    const known = new Set(apiMatchIds.map(String));
    return (detection.data?.recentMatchIds ?? []).filter(
      (id) => !known.has(id),
    );
  }, [detection.data, apiMatchIds]);
};

/**
 * Polling is nicer than keeping a watcher alive, and it is cheap enough to do
 * often: the backend caches the game path and reads only the bytes the log has
 * grown by, so a poll is a stat plus a few kilobytes. Queue and lobby lines land
 * within this of being written.
 */
const DETECT_INTERVAL_MS = 5_000;
/** Queues resolve in well under a minute, so watch them more closely. */
const QUEUED_INTERVAL_MS = 2_000;
/** The bridge reports every couple of seconds while numbers change. */
const IN_MATCH_INTERVAL_MS = 2_000;

export const useLiveMatchDetection = (enabled: boolean) =>
  useQuery({
    queryKey: ["live-match"],
    queryFn: () => invoke<LiveMatchStatus>("get_live_match"),
    refetchInterval: (query) => {
      if (!enabled) return false;
      // A board without a lobby is a bot or practice match, which logs none.
      if (query.state.data?.current || query.state.data?.scoreboard) {
        return IN_MATCH_INTERVAL_MS;
      }
      return query.state.data?.queuedSince
        ? QUEUED_INTERVAL_MS
        : DETECT_INTERVAL_MS;
    },
    enabled,
    meta: { skipGlobalErrorHandler: true },
  });

/**
 * The board the bridge reports, gated like the Live tab gates it, for the parts
 * of the Stats page outside the tab. Shares the tab's query, so no extra polls.
 */
export const useLiveBoard = (enabled: boolean): LiveBoard => {
  const detection = useLiveMatchDetection(enabled);
  const gameRunning = useGameRunning();
  return liveBoard(detection.data, gameRunning, Date.now());
};

/**
 * The local player's souls at every report this match. The session store keeps
 * it while the Live tab is closed.
 */
export const useSoulsTrail = (
  matchId: string | null,
  minutes: number | null,
  souls: number | null,
): SoulsPoint[] => {
  const recordSouls = useLiveSession((state) => state.recordSouls);
  const trail = useLiveSession((state) => soulsTrailOf(state.trails, matchId));

  useEffect(() => {
    if (minutes === null || souls === null) return;
    recordSouls(matchId, { minutes, souls });
  }, [recordSouls, matchId, minutes, souls]);

  return trail;
};
