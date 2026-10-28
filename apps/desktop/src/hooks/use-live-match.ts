import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

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
  /** What the live bridge HUD mod last reported; `null` until it reports. */
  scoreboard: LiveScoreboard | null;
  /**
   * The game's own state for the current lobby: `WaitingForPlayersToJoin`
   * through `PreGameWait` come before the zipline, `GameInProgress` after it.
   */
  gameState: string | null;
};

/** Someone from the pre-match versus screen, with their account when known. */
export type LiveRosterPlayer = {
  name: string;
  accountId: number | null;
};

/** One player as the in-game top bar shows them. Unresolved values are `null`. */
export type LiveScoreboardPlayer = {
  name: string;
  heroId: number | null;
  heroName: string | null;
  souls: number | null;
  level: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  objectiveDamage: number | null;
  isLocal: boolean;
  isDead: boolean;
};

export type LiveScoreboard = {
  /** The in-game clock as the top bar prints it. */
  clock: string | null;
  /** The local player's team. */
  friendly: LiveScoreboardPlayer[];
  enemy: LiveScoreboardPlayer[];
  /** The game's team number of `friendly`: 2 Hidden King, 3 Archmother. */
  friendlyTeam: number;
  /** Console log timestamp of the newest report. */
  updatedAt: string | null;
  /** Everyone the versus screen listed; empty when it was never shown. */
  roster: LiveRosterPlayer[];
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
