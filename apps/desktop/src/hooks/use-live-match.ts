import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo } from "react";
import type { Grade } from "@/lib/stats/live-grades";
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
      return query.state.data?.queued ? QUEUED_INTERVAL_MS : DETECT_INTERVAL_MS;
    },
    enabled,
    meta: { skipGlobalErrorHandler: true },
  });

export interface SoulsPoint {
  minutes: number;
  souls: number;
}

/** Long enough to outlast any match; the next match starts a new trail. */
const TRAIL_GC_MS = 2 * 60 * 60 * 1000;

const soulsTrailKey = (matchId: string | null) => [
  "live-souls-trail",
  matchId ?? "practice",
];

/**
 * The local player's souls at every report this match. The bridge only ever
 * says what the top bar shows now, so the history is ours to keep; the query
 * cache keeps it while the Live tab is closed.
 */
export const useSoulsTrail = (
  matchId: string | null,
  minutes: number | null,
  souls: number | null,
): SoulsPoint[] => {
  const queryClient = useQueryClient();
  const key = soulsTrailKey(matchId);

  useEffect(() => {
    if (minutes === null || souls === null) return;
    queryClient.setQueryData<SoulsPoint[]>(
      soulsTrailKey(matchId),
      (trail = []) => {
        const last = trail.at(-1);
        return last && last.minutes >= minutes
          ? trail
          : [...trail, { minutes, souls }];
      },
    );
  }, [queryClient, matchId, minutes, souls]);

  return (
    useQuery({
      queryKey: key,
      queryFn: () => queryClient.getQueryData<SoulsPoint[]>(key) ?? [],
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: TRAIL_GC_MS,
    }).data ?? []
  );
};

const QUEUED_SINCE_KEY = ["live-queued-since"];

/** When the current matchmaking search started, or `null` out of the queue. */
export const useQueuedSince = (queued: boolean): number | null => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const since = queryClient.getQueryData<number | null>(QUEUED_SINCE_KEY);
    if (queued && !since) {
      queryClient.setQueryData(QUEUED_SINCE_KEY, Date.now());
    } else if (!queued && since) {
      queryClient.setQueryData(QUEUED_SINCE_KEY, null);
    }
  }, [queryClient, queued]);

  return (
    useQuery({
      queryKey: QUEUED_SINCE_KEY,
      queryFn: () =>
        queryClient.getQueryData<number | null>(QUEUED_SINCE_KEY) ?? null,
      staleTime: Number.POSITIVE_INFINITY,
    }).data ?? null
  );
};

const FINAL_GRADES_KEY = ["live-final-grades"];

/**
 * The overall grade each match ended on, by match id, so the queue screen can
 * show how the last match went before the API has it.
 */
export const useFinalGrades = () => {
  const queryClient = useQueryClient();
  const grades =
    useQuery({
      queryKey: FINAL_GRADES_KEY,
      queryFn: () =>
        queryClient.getQueryData<Record<string, Grade>>(FINAL_GRADES_KEY) ?? {},
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    }).data ?? {};
  const remember = useCallback(
    (matchId: string, grade: Grade) =>
      queryClient.setQueryData<Record<string, Grade>>(
        FINAL_GRADES_KEY,
        (current = {}) =>
          current[matchId] === grade
            ? current
            : { ...current, [matchId]: grade },
      ),
    [queryClient],
  );
  return { grades, remember };
};

/** What the Stats page's tab row says about the board on screen. */
export interface LiveHeadline {
  /** Reading the versus screen before the zipline, the top bar after it. */
  source: "versusScreen" | "topBar";
  reportedAt: number | null;
  matchId: string | null;
}

const HEADLINE_KEY = ["live-headline"];

export const useLiveHeadline = (): LiveHeadline | null => {
  const queryClient = useQueryClient();
  return (
    useQuery({
      queryKey: HEADLINE_KEY,
      queryFn: () =>
        queryClient.getQueryData<LiveHeadline | null>(HEADLINE_KEY) ?? null,
      staleTime: Number.POSITIVE_INFINITY,
    }).data ?? null
  );
};

/** Hands the board's headline to the tab row, which lives outside the panel. */
export const usePublishLiveHeadline = (headline: LiveHeadline | null) => {
  const queryClient = useQueryClient();
  const source = headline?.source ?? null;
  const reportedAt = headline?.reportedAt ?? null;
  const matchId = headline?.matchId ?? null;

  useEffect(() => {
    queryClient.setQueryData<LiveHeadline | null>(
      HEADLINE_KEY,
      source ? { source, reportedAt, matchId } : null,
    );
  }, [queryClient, source, reportedAt, matchId]);

  useEffect(
    () => () => {
      queryClient.setQueryData(HEADLINE_KEY, null);
    },
    [queryClient],
  );
};
