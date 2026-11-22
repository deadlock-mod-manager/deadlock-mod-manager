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

const DETECT_INTERVAL_MS = 5_000;
const QUEUED_INTERVAL_MS = 2_000;
const IN_MATCH_INTERVAL_MS = 2_000;

export const useLiveMatchDetection = (enabled: boolean) =>
  useQuery({
    queryKey: ["live-match"],
    queryFn: () => invoke<LiveMatchStatus>("get_live_match"),
    refetchInterval: (query) => {
      if (!enabled) return false;
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

export const useLiveBoard = (): LiveBoard => {
  const detection = useLiveMatchDetection(true);
  const gameRunning = useGameRunning();
  return liveBoard(detection.data, gameRunning, Date.now());
};

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
