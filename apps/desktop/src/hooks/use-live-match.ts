import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPlayerHeroStats, getSteamProfiles } from "@/lib/stats/api";
import { cachedFetch, STATS_TTL } from "@/lib/stats/cache";
import {
  getLiveBroadcast,
  getRanksFor,
  type LiveMatchSample,
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

/** Everything the stream produces, tagged with the match it belongs to. */
type LiveStream = {
  matchId: string | null;
  players: LivePlayer[];
  samples: LiveMatchSample[];
  status: LiveStatus;
};

const emptyStream = (matchId: string | null): LiveStream => ({
  matchId,
  players: [],
  samples: [],
  status: "connecting",
});

/**
 * The live scoreboard: the match from the game's console log, its broadcast, and
 * the profile/rank/hero data for everyone in the lobby.
 */
export const useLiveMatch = (enabled: boolean) => {
  const detection = useLiveMatchDetection(enabled);
  const matchId = detection.data?.current?.matchId ?? null;

  const [stream, setStream] = useState<LiveStream>(() => emptyStream(null));
  // Keyed by match rather than cleared in an effect: a new lobby shows an empty
  // scoreboard on the same render, not one commit later.
  const live =
    enabled && stream.matchId === matchId ? stream : emptyStream(matchId);

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
    enabled: enabled && matchId !== null,
    // The 2/h limit makes retrying counterproductive.
    retry: false,
    staleTime: BROADCAST_TTL,
    meta: { skipGlobalErrorHandler: true },
  });

  const broadcastUrl = broadcast.data?.data.broadcast_url ?? null;

  useEffect(() => {
    if (!enabled || !broadcastUrl || matchId === null) {
      return;
    }
    const patch = (update: Partial<LiveStream>) =>
      setStream((prev) => ({
        ...(prev.matchId === matchId ? prev : emptyStream(matchId)),
        ...update,
      }));
    // The cleanup covers both a changed broadcast and unmount, so leaving the
    // tab or the page cannot keep the stream running.
    return subscribeToLiveMatch(
      broadcastUrl,
      (players) => patch({ players }),
      (status) => patch({ status }),
      (samples) => patch({ samples }),
    );
  }, [enabled, broadcastUrl, matchId]);

  const accountIds = [
    ...new Set(live.players.map((player) => player.accountId)),
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
    players: live.players,
    samples: live.samples,
    status: live.status,
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
