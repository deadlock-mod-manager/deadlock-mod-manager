import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { getPlayerHeroStats, getSteamProfiles } from "@/lib/stats/api";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import { getLiveBroadcast, getRanksFor } from "@/lib/stats/live";
import {
  connectLiveStream,
  getLiveStream,
  subscribeToLiveStream,
} from "@/lib/stats/live-store";

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
  /** Matches played this session, which the API may not have ingested yet. */
  recentMatchIds: string[];
};

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
 *
 * Every piece of it is shared - the queries through react-query, the stream
 * through the module store - so mounting this in several places costs one set of
 * requests and one connection. `LiveMatchRenderer` keeps it alive app-wide,
 * which is what makes opening the tab instant instead of a fresh connect.
 */
export const useLiveMatch = () => {
  const detection = useLiveMatchDetection(true);
  const matchId = detection.data?.current?.matchId ?? null;

  const broadcast = useQuery({
    queryKey: ["live-broadcast", matchId],
    queryFn: () => {
      if (matchId === null) {
        throw new RuntimeError("live broadcast query ran without a match");
      }
      return cachedFetch(`live:broadcast:${matchId}`, BROADCAST_TTL, () =>
        getLiveBroadcast(matchId),
      );
    },
    enabled: matchId !== null,
    // The 2/h limit makes retrying counterproductive.
    retry: false,
    staleTime: BROADCAST_TTL,
    meta: { skipGlobalErrorHandler: true },
  });

  const broadcastUrl = broadcast.data?.data.broadcast_url ?? null;

  // No cleanup: the stream is deliberately not tied to this component's life, so
  // leaving the tab leaves the board and the sample history intact.
  useEffect(() => {
    if (matchId === null || broadcastUrl === null) {
      return;
    }
    connectLiveStream(matchId, broadcastUrl);
  }, [broadcastUrl, matchId]);

  const live = useSyncExternalStore(subscribeToLiveStream, getLiveStream);

  // Recomputed off every published tick, and `LiveMatchRenderer` keeps a
  // subscriber alive app-wide, so these stay memoized rather than re-sorting and
  // re-allocating once a second for whatever page happens to be open.
  const accountIds = useMemo(
    () =>
      [...new Set(live.players.map((player) => player.accountId))].sort(
        (a, b) => a - b,
      ),
    [live.players],
  );
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

  const lobby = useMemo(
    () => ({
      profiles: new Map(
        (profiles.data?.data.steam ?? []).map((profile) => [
          profile.account_id,
          profile,
        ]),
      ),
      ranks: new Map(profiles.data?.data.ranks ?? []),
      heroStats: profiles.data?.data.heroStats ?? [],
    }),
    [profiles.data],
  );

  const refresh = useCallback(() => {
    void detection.refetch();
  }, [detection]);

  return {
    /**
     * The round on screen, or `null` when there is nothing to show. It outlives
     * the lobby: the game stops reporting a match the moment the lobby is torn
     * down, but the scoreboard of the round just played stays readable until the
     * next one starts. `isRunning` is the difference between the two.
     */
    board: detection.data?.current
      ? { matchId: detection.data.current.matchId, isRunning: true }
      : live.players.length > 0 && live.matchId !== null
        ? { matchId: live.matchId, isRunning: false }
        : null,
    // Absent only until the first poll answers; assume it works until told otherwise.
    consoleLogAvailable: detection.data?.consoleLogAvailable ?? true,
    queued: detection.data?.queued ?? false,
    players: live.players,
    samples: live.samples,
    status: live.status,
    profiles: lobby.profiles,
    ranks: lobby.ranks,
    heroStats: lobby.heroStats,
    isDetecting: detection.isPending,
    broadcastError: broadcast.error,
    isResolvingBroadcast: broadcast.isPending && matchId !== null,
    refresh,
  };
};
