import { createLogger } from "@/lib/logger";
import {
  API_HEADERS,
  DeadlockApiError,
  getPlayerRank,
  type PlayerRank,
} from "@/lib/stats/api";
import { fetch } from "@/lib/fetch";
import {
  type LiveMatchSample,
  type LivePlayer,
  sampleMatch,
  toPlayer,
} from "@/lib/stats/live-players";
import { readSteamId } from "@/lib/stats/steam-id";
import {
  type LiveBroadcast,
  liveBroadcastSchema,
} from "@/lib/validation/live-match";

// The scoreboard model itself lives in `live-players`; re-exported so callers
// keep one import for the whole live feature.
export * from "@/lib/stats/live-players";
export type { LiveBroadcast };

const logger = createLogger("live-match");

const BASE_URL = "https://api.deadlock-api.com";

/**
 * Resolving this makes the API spectate the lobby, which is why it is capped at
 * 2 requests per hour per IP. Call it once per match and cache the result.
 */
export const getLiveBroadcast = async (
  matchId: string,
): Promise<LiveBroadcast> => {
  const response = await fetch(`${BASE_URL}/v1/matches/${matchId}/live/url`, {
    headers: API_HEADERS,
  });
  if (!response.ok) {
    throw new DeadlockApiError(response.status, "/live/url");
  }
  const broadcast = liveBroadcastSchema.safeParse(await response.json());
  if (!broadcast.success) {
    // The URL feeds an EventSource; a malformed handle is as good as no answer.
    throw new DeadlockApiError(response.status, "/live/url");
  }
  return broadcast.data;
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
/** One sample per 15 match-seconds keeps a 40 minute match around 160 points. */
const SAMPLE_INTERVAL_S = 15;

export type LiveStatus = "connecting" | "streaming" | "ended" | "error";

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
      const player = toPlayer(steamId64, JSON.parse(event.data));
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
