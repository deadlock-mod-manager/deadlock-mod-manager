import type { PlayerHeroStats } from "@/lib/stats/api";
import { accountIdFromSteamId64 } from "@/lib/stats/steam-id";
import {
  AMBER_TEAM,
  type LiveTeam,
  liveRowSchema,
  SAPPHIRE_TEAM,
} from "@/lib/validation/live-match";

/**
 * Turning live query rows into the scoreboard. Pure on purpose: the transport
 * lives in `live.ts`, so this half stays trivial to reason about and to test.
 */

export { AMBER_TEAM, SAPPHIRE_TEAM };

/** Source 2 runs at 60 Hz, which turns ticks into match seconds. */
const TICKS_PER_SECOND = 60;

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
  team: LiveTeam;
  heroId: number;
  netWorth: number;
  kills: number;
  deaths: number;
  assists: number;
  level: number;
  /** In-game rank; 0 in unranked lobbies. */
  currentRank: number;
}

const isSapphire = (player: LivePlayer) => player.team === SAPPHIRE_TEAM;
const isAmber = (player: LivePlayer) => player.team === AMBER_TEAM;

/**
 * A row off the wire, or null if it is not a player. The payload is external
 * JSON, so it is parsed rather than trusted: a row on neither team would end up
 * counted on one of them, and a non-object would become an all-zero player.
 */
export const toPlayer = (
  steamId64: string,
  raw: unknown,
): LivePlayer | null => {
  // Spectator and placeholder controllers carry no Steam id.
  if (steamId64 === "0") {
    return null;
  }
  const parsed = liveRowSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const row = parsed.data;
  return {
    accountId: accountIdFromSteamId64(steamId64),
    steamId64,
    tick: row.tick,
    team: row.m_iTeamNum,
    heroId: row.m_PlayerDataGlobal__m_nHeroID,
    netWorth: row.m_PlayerDataGlobal__m_iGoldNetWorth,
    kills: row.m_PlayerDataGlobal__m_iPlayerKills,
    deaths: row.m_PlayerDataGlobal__m_iDeaths,
    assists: row.m_PlayerDataGlobal__m_iPlayerAssists,
    level: row.m_PlayerDataGlobal__m_iLevel,
    currentRank: row.m_nCurrentRank,
  };
};

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
