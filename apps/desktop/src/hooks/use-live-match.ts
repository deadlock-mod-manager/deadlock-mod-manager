import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayerHeroStats, getSteamProfiles } from "@/lib/stats/api";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import {
  getLiveBroadcast,
  getRanksFor,
  type LivePlayer,
  type LiveStatus,
  subscribeToLiveMatch,
} from "@/lib/stats/live";

export type LiveMatchInfo = {
  matchId: string;
  lobbyId: string;
};

export type LiveMatchStatus = {
  /** False without `-condebug`: no console log, nothing to read. */
  consoleLogAvailable: boolean;
  /** In matchmaking, waiting for a lobby. */
  queued: boolean;
  current: LiveMatchInfo | null;
};

/** Cheap local file read; polling it is nicer than keeping a watcher alive. */
const DETECT_INTERVAL_MS = 10_000;
/** Queues resolve in well under a minute, so watch them more closely. */
const QUEUED_INTERVAL_MS = 3_000;
/** A broadcast URL stays valid for the match, and resolving it is 2 req/h. */
const BROADCAST_TTL = 6 * 60 * 60 * 1000;

export const useLiveMatchDetection = (enabled: boolean) =>
  useQuery({
    queryKey: ["live-match"],
    queryFn: () => invoke<LiveMatchStatus>("get_live_match"),
    refetchInterval: (query) => {
      if (!enabled) return false;
      return query.state.data?.queued ? QUEUED_INTERVAL_MS : DETECT_INTERVAL_MS;
    },
    enabled,
    meta: { skipGlobalErrorHandler: true },
  });

/**
 * The live scoreboard: the match from the game's console log, its broadcast, and
 * the profile/rank/hero data for everyone in the lobby.
 */
export const useLiveMatch = (enabled: boolean) => {
  const detection = useLiveMatchDetection(enabled);
  const matchId = detection.data?.current?.matchId ?? null;

  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const stopRef = useRef<(() => void) | null>(null);

  const broadcast = useQuery({
    queryKey: ["live-broadcast", matchId],
    queryFn: () =>
      cachedFetch(`live:broadcast:${matchId}`, BROADCAST_TTL, () =>
        getLiveBroadcast(matchId as string),
      ),
    enabled: enabled && matchId !== null,
    // The 2/h limit makes retrying counterproductive.
    retry: false,
    staleTime: BROADCAST_TTL,
    meta: { skipGlobalErrorHandler: true },
  });

  const broadcastUrl = broadcast.data?.data.broadcast_url ?? null;

  useEffect(() => {
    if (!enabled || !broadcastUrl) {
      return;
    }
    setPlayers([]);
    setStatus("connecting");
    const stop = subscribeToLiveMatch(broadcastUrl, setPlayers, setStatus);
    stopRef.current = stop;
    return () => {
      stopRef.current = null;
      stop();
    };
  }, [enabled, broadcastUrl]);

  // Leaving the tab or the page must not keep the stream running.
  useEffect(() => () => stopRef.current?.(), []);

  const accountIds = [
    ...new Set(players.map((player) => player.accountId)),
  ].sort((a, b) => a - b);
  const lobbyKey = accountIds.join(",");

  const profiles = useQuery({
    queryKey: ["live-profiles", lobbyKey],
    queryFn: () =>
      cachedFetch(
        `live:profiles:${lobbyKey}`,
        STATS_TTL.steamProfiles,
        async () => {
          const [steam, ranks, heroStats] = await Promise.all([
            getSteamProfiles(accountIds),
            getRanksFor(accountIds),
            getPlayerHeroStats(accountIds),
          ]);
          return {
            steam,
            ranks: [...ranks.entries()],
            heroStats,
          };
        },
      ),
    enabled: accountIds.length > 0,
    staleTime: STATS_TTL.steamProfiles,
    meta: { skipGlobalErrorHandler: true },
  });

  const refresh = useCallback(() => {
    void detection.refetch();
  }, [detection]);

  return {
    match: detection.data?.current ?? null,
    // Absent only until the first poll answers; assume it works until told otherwise.
    consoleLogAvailable: detection.data?.consoleLogAvailable ?? true,
    queued: detection.data?.queued ?? false,
    players,
    status,
    profiles: new Map(
      (profiles.data?.data.steam ?? []).map((profile) => [
        profile.account_id,
        profile,
      ]),
    ),
    ranks: new Map(profiles.data?.data.ranks ?? []),
    heroStats: profiles.data?.data.heroStats ?? [],
    isDetecting: detection.isPending,
    broadcastError: broadcast.error,
    isResolvingBroadcast: broadcast.isPending && matchId !== null,
    refresh,
  };
};
