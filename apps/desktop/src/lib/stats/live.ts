import { createLogger } from "@/lib/logger";
import {
  apiHeaders,
  apiKeyQuery,
  DeadlockApiError,
  getPlayerRank,
  type PlayerHeroStats,
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
  const response = await fetch(`${BASE_URL}/v1/matches/${matchId}/live/url`, {
    headers: apiHeaders(),
  });
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/live/url");
  }
  return (await response.json()) as LiveBroadcast;
};

/** One sample of the whole match, aggregated from the players at that moment. */
export interface LiveMatchSample {
  /** Seconds into the match, derived from the tick at 60 Hz. */
  second: number;
  sapphireNetWorth: number;
  amberNetWorth: number;
  /** Sapphire minus Amber; the number people actually read. */
  soulLead: number;
  sapphireKills: number;
  amberKills: number;
}

export interface LivePlayer {
  accountId: number;
  steamId64: string;
  tick: number;
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
  tick: number;
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
  'SELECT tick, "m_steamID", "m_iTeamNum", "m_nCurrentRank",',
  '"m_PlayerDataGlobal__m_nHeroID", "m_PlayerDataGlobal__m_iGoldNetWorth",',
  '"m_PlayerDataGlobal__m_iPlayerKills", "m_PlayerDataGlobal__m_iDeaths",',
  '"m_PlayerDataGlobal__m_iPlayerAssists", "m_PlayerDataGlobal__m_iLevel"',
  "FROM CCitadelPlayerController",
].join(" ");

/** Rows arrive per tick; the UI only needs the newest state per player. */
const FLUSH_INTERVAL_MS = 1000;
/**
 * A broadcast that is accepted but never sends anything leaves EventSource open
 * without ever firing `error`, and the tab would spin forever. Give the first row
 * this long to arrive.
 */
const FIRST_ROW_TIMEOUT_MS = 30_000;
/** Source 2 runs at 60 Hz, which turns ticks into match seconds. */
const TICKS_PER_SECOND = 60;
/** One sample per 15 match-seconds keeps a 40 minute match around 160 points. */
const SAMPLE_INTERVAL_S = 15;

/** The game numbers the teams 2 and 3. */
export const SAPPHIRE_TEAM = 2;
export const AMBER_TEAM = 3;

const isSapphire = (player: LivePlayer) => player.team === SAPPHIRE_TEAM;
// Anything that is not Sapphire counts as Amber, so a stray team number can
// never make the two sides add up to less than the lobby.
const isAmber = (player: LivePlayer) => !isSapphire(player);

/** Rolls the current player states up into one match-wide sample. */
export const sampleMatch = (players: LivePlayer[]): LiveMatchSample => {
  const sum = (
    side: (player: LivePlayer) => boolean,
    pick: (player: LivePlayer) => number,
  ) => players.filter(side).reduce((total, player) => total + pick(player), 0);

  const sapphireNetWorth = sum(isSapphire, (p) => p.netWorth);
  const amberNetWorth = sum(isAmber, (p) => p.netWorth);

  return {
    second: Math.round(
      Math.max(...players.map((player) => player.tick), 0) / TICKS_PER_SECOND,
    ),
    sapphireNetWorth,
    amberNetWorth,
    soulLead: sapphireNetWorth - amberNetWorth,
    sapphireKills: sum(isSapphire, (p) => p.kills),
    amberKills: sum(isAmber, (p) => p.kills),
  };
};

/**
 * The lobby's hero stats arrive as one flat list for every account. Both the
 * scoreboard and the player dialog want them per player, so the split lives here.
 */
export const heroStatsByAccount = (
  heroStats: PlayerHeroStats[],
): Map<number, PlayerHeroStats[]> => {
  const byAccount = new Map<number, PlayerHeroStats[]>();
  for (const entry of heroStats) {
    const existing = byAccount.get(entry.account_id);
    if (existing) {
      existing.push(entry);
    } else {
      byAccount.set(entry.account_id, [entry]);
    }
  }
  return byAccount;
};

export type LiveStatus = "connecting" | "streaming" | "ended" | "error";

const toPlayer = (steamId64: string, row: LiveRow): LivePlayer | null => {
  // Spectator and placeholder controllers carry no Steam id.
  if (steamId64 === "0") {
    return null;
  }
  return {
    accountId: accountIdFromSteamId64(steamId64),
    steamId64,
    tick: row.tick ?? 0,
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
  onSamples?: (samples: LiveMatchSample[]) => void,
): (() => void) => {
  const url = new URL(`${BASE_URL}/v1/matches/demo/live/query`);
  url.searchParams.set("query", LIVE_QUERY);
  url.searchParams.set("broadcast_url", broadcastUrl);
  // EventSource cannot send headers, which is what the query-param variant of
  // the key is for.
  const key = apiKeyQuery();
  if (key) {
    url.searchParams.set("api_key", key);
  }

  const latest = new Map<string, LivePlayer>();
  // The stream is the only source for these; sampling it as it arrives means the
  // match charts cost no extra requests.
  const samples: LiveMatchSample[] = [];
  let dirty = false;
  let closed = false;

  const publish = () => {
    const players = [...latest.values()];
    onPlayers(players);

    const sample = sampleMatch(players);
    const last = samples.at(-1);
    if (!last || sample.second - last.second >= SAMPLE_INTERVAL_S) {
      samples.push(sample);
      onSamples?.([...samples]);
    }
  };

  const source = new EventSource(url.toString());
  onStatus("connecting");

  const flush = window.setInterval(() => {
    if (!dirty) return;
    dirty = false;
    publish();
  }, FLUSH_INTERVAL_MS);

  const stop = () => {
    if (closed) return;
    closed = true;
    window.clearInterval(flush);
    window.clearTimeout(watchdog);
    source.close();
  };

  // Silent stream: nothing arrives, nothing errors. Treat it as a failure rather
  // than leave the UI connecting forever.
  const watchdog = window.setTimeout(() => {
    logger.warn("Live stream produced no rows");
    onStatus("error");
    stop();
  }, FIRST_ROW_TIMEOUT_MS);

  source.addEventListener("message", (event) => {
    try {
      const steamId64 = readSteamId(event.data);
      if (!steamId64) return;
      const player = toPlayer(steamId64, JSON.parse(event.data) as LiveRow);
      if (!player) return;
      window.clearTimeout(watchdog);
      latest.set(player.steamId64, player);
      dirty = true;
      onStatus("streaming");
    } catch (error) {
      logger.withError(error).warn("Unparsable live row");
    }
  });

  source.addEventListener("end", () => {
    publish();
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
      publish();
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
