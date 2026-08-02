import { createLogger } from "@/lib/logger";
import {
  DeadlockApiError,
  getPlayerRank,
  type PlayerRank,
} from "@/lib/stats/api";
import { fetch } from "@/lib/fetch";
import { accountIdFromSteamId64, readSteamId } from "@/lib/stats/steam-id";

const logger = createLogger("live-match");

const BASE_URL = "https://api.deadlock-api.com";

export interface LiveBroadcast {
  broadcast_url: string;
  lobby_id: number;
}

/**
 * Resolving this makes the API spectate the lobby, which is why it is capped at
 * 2 requests per hour per IP. Call it once per match and cache the result.
 */
export const getLiveBroadcast = async (
  matchId: string,
): Promise<LiveBroadcast> => {
  const response = await fetch(`${BASE_URL}/v1/matches/${matchId}/live/url`);
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/live/url");
  }
  return (await response.json()) as LiveBroadcast;
};

export interface LivePlayer {
  accountId: number;
  steamId64: string;
  /** 2 = Sapphire, 3 = Amber, as the game numbers them. */
  team: number;
  heroId: number;
  netWorth: number;
  kills: number;
  deaths: number;
  assists: number;
  level: number;
  /** In-game rank; 0 in unranked lobbies. */
  currentRank: number;
}

type LiveRow = {
  m_iTeamNum: number;
  m_nCurrentRank: number;
  m_PlayerDataGlobal__m_nHeroID: number;
  m_PlayerDataGlobal__m_iGoldNetWorth: number;
  m_PlayerDataGlobal__m_iPlayerKills: number;
  m_PlayerDataGlobal__m_iDeaths: number;
  m_PlayerDataGlobal__m_iPlayerAssists: number;
  m_PlayerDataGlobal__m_iLevel: number;
};

// Column names are case-sensitive and must be quoted; the table name must not be.
const LIVE_QUERY = [
  'SELECT "m_steamID", "m_iTeamNum", "m_nCurrentRank",',
  '"m_PlayerDataGlobal__m_nHeroID", "m_PlayerDataGlobal__m_iGoldNetWorth",',
  '"m_PlayerDataGlobal__m_iPlayerKills", "m_PlayerDataGlobal__m_iDeaths",',
  '"m_PlayerDataGlobal__m_iPlayerAssists", "m_PlayerDataGlobal__m_iLevel"',
  "FROM CCitadelPlayerController",
].join(" ");

/** Rows arrive per tick; the UI only needs the newest state per player. */
const FLUSH_INTERVAL_MS = 1000;

export type LiveStatus = "connecting" | "streaming" | "ended" | "error";

const toPlayer = (steamId64: string, row: LiveRow): LivePlayer | null => {
  // Spectator and placeholder controllers carry no Steam id.
  if (steamId64 === "0") {
    return null;
  }
  return {
    accountId: accountIdFromSteamId64(steamId64),
    steamId64,
    team: row.m_iTeamNum,
    heroId: row.m_PlayerDataGlobal__m_nHeroID,
    netWorth: row.m_PlayerDataGlobal__m_iGoldNetWorth ?? 0,
    kills: row.m_PlayerDataGlobal__m_iPlayerKills ?? 0,
    deaths: row.m_PlayerDataGlobal__m_iDeaths ?? 0,
    assists: row.m_PlayerDataGlobal__m_iPlayerAssists ?? 0,
    level: row.m_PlayerDataGlobal__m_iLevel ?? 0,
    currentRank: row.m_nCurrentRank ?? 0,
  };
};

/**
 * Streams the live scoreboard over Server-Sent Events. Uses the browser's
 * EventSource rather than the Tauri HTTP plugin because this needs a real
 * streaming body; the API allows any origin, so the webview can connect directly.
 *
 * Returns a stop function. Reconnects are deliberately not automatic - every
 * connection counts against the endpoint's 20 requests per minute.
 */
export const subscribeToLiveMatch = (
  broadcastUrl: string,
  onPlayers: (players: LivePlayer[]) => void,
  onStatus: (status: LiveStatus) => void,
): (() => void) => {
  const url = new URL(`${BASE_URL}/v1/matches/demo/live/query`);
  url.searchParams.set("query", LIVE_QUERY);
  url.searchParams.set("broadcast_url", broadcastUrl);

  const latest = new Map<string, LivePlayer>();
  let dirty = false;
  let closed = false;

  const source = new EventSource(url.toString());
  onStatus("connecting");

  const flush = window.setInterval(() => {
    if (!dirty) return;
    dirty = false;
    onPlayers([...latest.values()]);
  }, FLUSH_INTERVAL_MS);

  const stop = () => {
    if (closed) return;
    closed = true;
    window.clearInterval(flush);
    source.close();
  };

  source.addEventListener("message", (event) => {
    try {
      const steamId64 = readSteamId(event.data);
      if (!steamId64) return;
      const player = toPlayer(steamId64, JSON.parse(event.data) as LiveRow);
      if (!player) return;
      latest.set(player.steamId64, player);
      dirty = true;
      onStatus("streaming");
    } catch (error) {
      logger.withError(error).warn("Unparsable live row");
    }
  });

  source.addEventListener("end", () => {
    onPlayers([...latest.values()]);
    onStatus("ended");
    stop();
  });

  // The API's rejections arrive as `event: error` frames with a payload, while a
  // dropped connection fires the same event without one. Both are terminal here:
  // EventSource would otherwise reconnect on its own and burn the rate limit.
  source.addEventListener("error", (event) => {
    const data = (event as MessageEvent).data;
    if (data) {
      logger.withMetadata({ data }).warn("Live query rejected");
    }
    if (latest.size > 0) {
      onPlayers([...latest.values()]);
    }
    onStatus(latest.size > 0 ? "ended" : "error");
    stop();
  });

  return stop;
};

/** Ranks for the whole lobby; the batch MMR endpoint returns nothing for most accounts. */
export const getRanksFor = async (
  accountIds: number[],
): Promise<Map<number, PlayerRank>> => {
  const entries = await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        return [accountId, await getPlayerRank(accountId)] as const;
      } catch (error) {
        logger.withError(error).withMetadata({ accountId }).debug("No rank");
        return null;
      }
    }),
  );

  return new Map(
    entries.filter((entry): entry is [number, PlayerRank] => entry !== null),
  );
};
