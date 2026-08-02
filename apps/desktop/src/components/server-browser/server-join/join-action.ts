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
}

/**
 * How far the automated path got. The caller turns this into user feedback —
 * only `manual` asks the user to do something themselves.
 */
export type JoinOutcome =
  | { kind: "gateway" }
  | { kind: "launched"; passwordSkipped: boolean }
  | { kind: "steam-url" }
  | { kind: "manual"; code: string };

export const buildSteamConnectUrl = (
  server: ServerBrowserEntry,
  password: string,
): string | null => {
  const code = normalizeConnectCode(server.connect_code);
  if (!code) return null;
  if (server.password_protected && password) {
    return `steam://connect/${code}/${encodeURIComponent(password)}`;
  }
  return `steam://connect/${code}`;
};

/**
 * Gets the user into the server with as few manual steps as possible:
 * launch Deadlock with `+connect`, fall back to Steam's connect URI, and
 * only as a last resort hand the code over for the console.
 */
export const joinServer = async ({
  server,
  password,
  additionalArgs,
}: JoinServerArgs): Promise<JoinOutcome> => {
  if (server.gateway_url) {
    await openUrl(server.gateway_url);
    return { kind: "gateway" };
  }

  const connect = buildConnectArgs(server, password);

  if (connect) {
    const launchArgs = [additionalArgs.trim(), connect.args]
      .filter(Boolean)
      .join(" ");
    try {
      await invoke("launch_game_direct", { additionalArgs: launchArgs });
      return { kind: "launched", passwordSkipped: connect.passwordSkipped };
    } catch (err) {
      logger
        .withError(err)
        .warn("Direct launch failed, falling back to steam:// connect URL");
    }

    const steamUrl = buildSteamConnectUrl(server, password);
    if (steamUrl) {
      try {
        await openUrl(steamUrl);
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
