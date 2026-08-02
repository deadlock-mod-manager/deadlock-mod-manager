import { describe, expect, it } from "bun:test";
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
