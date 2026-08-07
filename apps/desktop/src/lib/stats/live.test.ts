import { describe, expect, it } from "bun:test";
import {
  AMBER_TEAM,
  SAPPHIRE_TEAM,
  sampleMatch,
  toPlayer,
} from "./live-players";
import { accountIdFromSteamId64, readSteamId } from "./steam-id";

// A real frame from the live query, verbatim.
const ROW =
  '{"m_steamID":76561198371579856,"m_iTeamNum":2,"m_nCurrentRank":0,"m_PlayerDataGlobal__m_nHeroID":15}';

describe("readSteamId", () => {
  it("keeps every digit of a 17-digit id", () => {
    expect(readSteamId(ROW)).toBe("76561198371579856");
  });

  it("survives the round trip that JSON.parse does not", () => {
    // Parsing first turns the id into a double that prints as ...860, which
    // shifts the account id by 4 and makes every profile lookup miss.
    const viaJson = String(JSON.parse(ROW).m_steamID);

    expect(viaJson).not.toBe("76561198371579856");
    expect(accountIdFromSteamId64(viaJson)).toBe(411_314_132);
    expect(accountIdFromSteamId64(readSteamId(ROW) as string)).toBe(
      411_314_128,
    );
  });

  it("accepts a quoted id in case the API switches to strings", () => {
    expect(readSteamId('{"m_steamID":"76561198371579856"}')).toBe(
      "76561198371579856",
    );
  });

  it("returns null when the column is missing", () => {
    expect(readSteamId('{"m_iTeamNum":2}')).toBeNull();
  });
});

describe("accountIdFromSteamId64", () => {
  it("subtracts the Steam3 base", () => {
    expect(accountIdFromSteamId64("76561198371579856")).toBe(411_314_128);
  });
});

const STEAM_ID = "76561198371579856";

describe("toPlayer", () => {
  it("fills the counters the stream omits", () => {
    const player = toPlayer(STEAM_ID, JSON.parse(ROW));

    expect(player).toMatchObject({
      accountId: 411_314_128,
      team: SAPPHIRE_TEAM,
      heroId: 15,
      netWorth: 0,
      kills: 0,
    });
  });

  it("drops spectator and placeholder controllers", () => {
    expect(toPlayer("0", JSON.parse(ROW))).toBeNull();
  });

  it("drops rows that are not objects", () => {
    expect(toPlayer(STEAM_ID, 42)).toBeNull();
    expect(toPlayer(STEAM_ID, "m_iTeamNum")).toBeNull();
    expect(toPlayer(STEAM_ID, null)).toBeNull();
  });

  it("drops rows without a team, rather than inventing a zero player", () => {
    expect(toPlayer(STEAM_ID, { tick: 100 })).toBeNull();
  });

  it("drops rows whose team is neither side", () => {
    expect(toPlayer(STEAM_ID, { m_iTeamNum: 0 })).toBeNull();
    expect(toPlayer(STEAM_ID, { m_iTeamNum: 4 })).toBeNull();
  });
});

describe("sampleMatch", () => {
  const player = (team: number, netWorth: number, kills: number) =>
    toPlayer(STEAM_ID, {
      tick: 600,
      m_iTeamNum: team,
      m_PlayerDataGlobal__m_iGoldNetWorth: netWorth,
      m_PlayerDataGlobal__m_iPlayerKills: kills,
    });

  it("splits the lobby by team", () => {
    const players = [
      player(SAPPHIRE_TEAM, 1000, 2),
      player(SAPPHIRE_TEAM, 500, 1),
      player(AMBER_TEAM, 900, 4),
    ].filter((entry) => entry !== null);

    expect(sampleMatch(players)).toEqual({
      second: 10,
      sapphireNetWorth: 1500,
      amberNetWorth: 900,
      soulLead: 600,
      sapphireKills: 3,
      amberKills: 4,
    });
  });
});
