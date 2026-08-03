import { z } from "zod";

/** Schemas for the live match feed: the broadcast handle and the query rows. */

export const liveBroadcastSchema = z.object({
  // Empty is as useless as missing: it goes straight into an EventSource.
  broadcast_url: z.string().min(1),
  lobby_id: z.number(),
});

/** The game numbers the teams 2 and 3. */
export const SAPPHIRE_TEAM = 2;
export const AMBER_TEAM = 3;

/**
 * One row of the live query. Only the team is strict: a row that lands on
 * neither side would otherwise be counted as a player on one of them. The
 * counters default to 0 because the stream omits them until they move.
 */
export const liveRowSchema = z.object({
  tick: z.number().default(0),
  m_iTeamNum: z.union([z.literal(SAPPHIRE_TEAM), z.literal(AMBER_TEAM)]),
  m_nCurrentRank: z.number().default(0),
  m_PlayerDataGlobal__m_nHeroID: z.number().default(0),
  m_PlayerDataGlobal__m_iGoldNetWorth: z.number().default(0),
  m_PlayerDataGlobal__m_iPlayerKills: z.number().default(0),
  m_PlayerDataGlobal__m_iDeaths: z.number().default(0),
  m_PlayerDataGlobal__m_iPlayerAssists: z.number().default(0),
  m_PlayerDataGlobal__m_iLevel: z.number().default(0),
});

export type LiveBroadcast = z.infer<typeof liveBroadcastSchema>;
export type LiveRow = z.infer<typeof liveRowSchema>;
export type LiveTeam = LiveRow["m_iTeamNum"];
