import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import logger from "@/lib/logger";
import { buildConnectArgs, normalizeConnectCode } from "./connect-args";

interface JoinServerArgs {
  server: ServerBrowserEntry;
  password: string;
  /** The user's regular DMM launch options, prepended to the connect args. */
  additionalArgs: string;
  /** Whether Deadlock is already up, in which case we can join without a restart. */
  gameRunning: boolean;
}

/**
 * How far the automated path got. The caller turns this into user feedback —
 * only `manual` asks the user to do something themselves.
 */
export type JoinOutcome =
  | { kind: "gateway" }
  | { kind: "launched"; passwordSkipped: boolean; watched: boolean }
  | { kind: "steam-url" }
  | { kind: "manual"; code: string };

/**
 * The client writes `console.log` only when it was started with `-condebug`,
 * and that log is how we verify the connect actually landed.
 */
export const withConsoleLog = (args: string): string =>
  /(^|\s)-condebug(\s|$)/.test(args) ? args : `${args} -condebug`.trim();

export const buildSteamConnectUrl = (
  server: ServerBrowserEntry,
  password: string,
  resolvedAddress?: string,
): string | null => {
  const code = resolvedAddress ?? normalizeConnectCode(server.connect_code);
  if (!code) return null;
  if (server.password_protected && password) {
    return `steam://connect/${code}/${encodeURIComponent(password)}`;
  }
  return `steam://connect/${code}`;
};

/**
 * Resolve the connect code to the literal `ip:port` Steam's connect handler
 * needs. Lobby ids and unresolvable hosts come back as null — those can only
 * be joined through `+connect`.
 */
const resolveSteamAddress = async (
  server: ServerBrowserEntry,
): Promise<string | null> => {
  const code = normalizeConnectCode(server.connect_code);
  if (!code || code.startsWith("[")) return null;
  try {
    return await invoke<string>("resolve_connect_address", { address: code });
  } catch (err) {
    logger
      .withError(err)
      .warn("Could not resolve the connect code to an ip:port");
    return null;
  }
};

/**
 * Keep an eye on the client and re-issue `steam://connect` if Deadlock
 * swallowed the boot-time `+connect` and dropped the player in the hideout.
 */
const watchConnect = async (
  address: string,
  password: string,
  server: ServerBrowserEntry,
  coldStart: boolean,
): Promise<boolean> => {
  try {
    await invoke("watch_server_connect", {
      address,
      password: server.password_protected && password ? password : null,
      coldStart,
    });
    return true;
  } catch (err) {
    logger.withError(err).warn("Could not start the connect watchdog");
    return false;
  }
};

/**
 * Gets the user into the server with as few manual steps as possible.
 *
 * With the game already running, `steam://connect` hands the address straight
 * to the client — no restart. From cold we launch with `+connect` so the
 * user's launch options survive, then let the watchdog re-issue the Steam
 * connect if the client came up in the hideout instead of on the server.
 */
export const joinServer = async ({
  server,
  password,
  additionalArgs,
  gameRunning,
}: JoinServerArgs): Promise<JoinOutcome> => {
  if (server.gateway_url) {
    await openUrl(server.gateway_url);
    return { kind: "gateway" };
  }

  const address = await resolveSteamAddress(server);

  if (address && gameRunning) {
    const steamUrl = buildSteamConnectUrl(server, password, address);
    if (steamUrl) {
      try {
        await openUrl(steamUrl);
        await watchConnect(address, password, server, false);
        return { kind: "steam-url" };
      } catch (err) {
        logger
          .withError(err)
          .warn("steam:// connect failed on a running client, relaunching");
      }
    }
  }

  const connect = buildConnectArgs(server, password);

  if (connect) {
    const launchArgs = withConsoleLog(
      [additionalArgs.trim(), connect.args].filter(Boolean).join(" "),
    );
    try {
      await invoke("launch_game_direct", { additionalArgs: launchArgs });
      const watched = address
        ? await watchConnect(address, password, server, true)
        : false;
      return {
        kind: "launched",
        passwordSkipped: connect.passwordSkipped,
        watched,
      };
    } catch (err) {
      logger
        .withError(err)
        .warn("Direct launch failed, falling back to steam:// connect URL");
    }

    const steamUrl = buildSteamConnectUrl(
      server,
      password,
      address ?? undefined,
    );
    if (steamUrl) {
      try {
        await openUrl(steamUrl);
        if (address) {
          await watchConnect(address, password, server, true);
        }
        return { kind: "steam-url" };
      } catch (err) {
        logger
          .withError(err)
          .warn("steam:// connect URL failed, falling back to clipboard");
      }
    }
  }

  const code = server.connect_code?.trim();
  if (!code) {
    throw new Error("This server did not provide a way to connect.");
  }

  const payload =
    server.password_protected && password ? `${code} ${password}` : code;
  await writeText(payload);
  return { kind: "manual", code };
};
