import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getPlayerHeroStats, getSteamProfiles } from "@/lib/stats/api";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import { getLiveBroadcast, getRanksFor } from "@/lib/stats/live";
import {
  beginLiveMatch,
  connectLiveStream,
  getLiveStream,
  reopenLiveStream,
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

/**
 * Polling is nicer than keeping a watcher alive, and it is cheap enough to do
 * often: the backend caches the game path and reads only the bytes the log has
 * grown by, so a poll is a stat plus a few kilobytes. Queue and lobby lines land
 * within this of being written, which is what the Live tab reacts to.
 */
const DETECT_INTERVAL_MS = 5_000;
/** Queues resolve in well under a minute, so watch them more closely. */
const QUEUED_INTERVAL_MS = 2_000;
/** A broadcast URL stays valid for the match, and resolving it is 2 req/h. */
const BROADCAST_TTL = 6 * 60 * 60 * 1000;
/** How long the roster has to hold still before it counts as the final lobby. */
const LOBBY_SETTLE_MS = 2_000;

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
  // leaving the tab leaves the board and the sample history intact. The round is
  // claimed before its broadcast resolves, so the seconds spent waiting on that
  // request do not show the previous match's board under the new match's id.
  useEffect(() => {
    if (matchId === null) {
      return;
    }
    beginLiveMatch(matchId);
    if (broadcastUrl === null) {
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
  // Players arrive over the first few ticks, so the roster grows one or two at a
  // time. Keying the lobby queries straight off it would refetch on every step -
  // and ranks cost one request per player, so a twelve-player lobby would burn
  // dozens of them before it is even complete.
  const lobbyKey = useDebouncedValue(accountIds.join(","), LOBBY_SETTLE_MS);
  // Read back out of the settled key rather than used alongside it: the live
  // roster is ahead of the key by design, and fetching one roster under another
  // one's cache entry would pin the wrong answer in place.
  const lobbyIds = useMemo(
    () => (lobbyKey === "" ? [] : lobbyKey.split(",").map(Number)),
    [lobbyKey],
  );

  const steamProfiles = useQuery({
    queryKey: ["live-player-data", "profiles", lobbyKey],
    queryFn: () =>
      cachedFetch(
        `live:steam-profiles:${lobbyKey}`,
        STATS_TTL.steamProfiles,
        () => getSteamProfiles(lobbyIds),
      ),
    enabled: lobbyIds.length > 0,
    staleTime: STATS_TTL.steamProfiles,
    meta: { skipGlobalErrorHandler: true },
  });

  const ranks = useQuery({
    queryKey: ["live-player-data", "ranks", lobbyKey],
    queryFn: () =>
      cachedFetch(`live:ranks:${lobbyKey}`, STATS_TTL.rank, async () => [
        ...(await getRanksFor(lobbyIds)).entries(),
      ]),
    enabled: lobbyIds.length > 0,
    staleTime: STATS_TTL.rank,
    meta: { skipGlobalErrorHandler: true },
  });

  const heroStats = useQuery({
    queryKey: ["live-player-data", "hero-stats", lobbyKey],
    queryFn: () =>
      cachedFetch(`live:hero-stats:${lobbyKey}`, STATS_TTL.heroStats, () =>
        getPlayerHeroStats(lobbyIds),
      ),
    enabled: lobbyIds.length > 0,
    staleTime: STATS_TTL.heroStats,
    meta: { skipGlobalErrorHandler: true },
  });

  const lobby = useMemo(
    () => ({
      profiles: new Map(
        (steamProfiles.data?.data ?? []).map((profile) => [
          profile.account_id,
          profile,
        ]),
      ),
      ranks: new Map(ranks.data?.data ?? []),
      heroStats: heroStats.data?.data ?? [],
    }),
    [steamProfiles.data, ranks.data, heroStats.data],
  );

  const { refetch } = detection;
  const refetchBroadcast = broadcast.refetch;
  const broadcastFailed = broadcast.isError;

  /**
   * The one thing in here that is asked for rather than polled, so it retries
   * everything that gives up on its own: detection, the broadcast handle after
   * it was refused, and the stream itself once it has ended or dropped.
   *
   * Reconnecting is left to the button on purpose. A broadcast that closed early
   * usually closes early again, and doing that on a timer would spend the
   * endpoint's budget on a match that is over.
   */
  const refresh = useCallback(() => {
    void refetch();
    if (broadcastFailed) {
      void refetchBroadcast();
    } else if (matchId !== null && broadcastUrl !== null) {
      reopenLiveStream();
      connectLiveStream(matchId, broadcastUrl);
    }
  }, [refetch, refetchBroadcast, broadcastFailed, matchId, broadcastUrl]);

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
