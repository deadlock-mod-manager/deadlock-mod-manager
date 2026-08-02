/** SteamID64 - this = the Steam3 account id deadlock-api works with. */
const STEAM_ID64_BASE = 76_561_197_960_265_728n;

export const accountIdFromSteamId64 = (steamId64: string | number): number =>
  Number(BigInt(steamId64) - STEAM_ID64_BASE);

/**
 * A SteamID64 has 17 digits and does not survive `JSON.parse`: the double it
 * becomes prints as a slightly different number, which silently shifts the
 * account id by a few and makes every profile lookup miss. Read it straight out
 * of the raw frame instead.
 */
const STEAM_ID_PATTERN = /"m_steamID"\s*:\s*"?(\d+)"?/;

export const readSteamId = (rawRow: string): string | null =>
  rawRow.match(STEAM_ID_PATTERN)?.[1] ?? null;
