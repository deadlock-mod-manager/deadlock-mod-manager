import { z } from "zod";
import type { ServerBrowserEntry } from "./schemas/server-browser.schemas";

const DeadworksPlayerSchema = z.object({
  name: z.string(),
  hero: z.string().optional().default(""),
  team: z.number().int().optional().default(0),
  kills: z.number().int().optional().default(0),
  deaths: z.number().int().optional().default(0),
  assists: z.number().int().optional().default(0),
  level: z.number().int().optional().default(0),
});

const DeadworksRegistryServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().optional().default(""),
  raw_address: z.string().optional().default(""),
  country: z.string().optional().default(""),
  region: z.string().optional().default(""),
  player_count: z.number().int().optional().default(0),
  max_players: z.number().int(),
  map: z.string().optional().default(""),
  players: z.array(DeadworksPlayerSchema).optional().default([]),
  content_addons: z.array(z.string()).optional().default([]),
  /** Custom maps the server rotates through, on top of `map`. */
  extra_maps: z.array(z.string()).optional().default([]),
  version: z.string().optional().default(""),
  visibility: z
    .enum(["public", "unlisted", "private", "password"])
    .optional()
    .default("public"),
  password_protected: z.boolean().optional().default(false),
  last_heartbeat: z.string().nullable().optional(),
});

export const DeadworksRegistryResponseSchema = z.object({
  servers: z.array(DeadworksRegistryServerSchema),
});

/** A record from Steam's master server list, as proxied by Deadworks. */
const DeadworksSteamServerSchema = z.object({
  addr: z.string(),
  gameport: z.number().int().optional(),
  steamid: z.string(),
  name: z.string(),
  players: z.number().int().optional().default(0),
  max_players: z.number().int(),
  map: z.string().optional().default(""),
  gametype: z.string().optional().default(""),
});

export const DeadworksSteamResponseSchema = z.object({
  servers: z.array(DeadworksSteamServerSchema),
});

/** Every Deadworks server sets it; the endpoint filters on it but we re-check. */
const DEADWORKS_TAG = "dw1";
/** The host asked not to be listed. */
const UNLISTED_TAG = "dwu";

const parseAddress = (address: string): { ip: string; port: number } | null => {
  const separator = address.lastIndexOf(":");
  if (separator <= 0) return null;

  const rawIp = address.slice(0, separator).trim();
  const ip =
    rawIp.startsWith("[") && rawIp.endsWith("]") ? rawIp.slice(1, -1) : rawIp;
  const port = Number(address.slice(separator + 1));

  if (!ip || !Number.isInteger(port) || port < 1 || port > 65_535) {
    return null;
  }

  return { ip, port };
};

const normalizeLastSeen = (value?: string | null): string => {
  if (!value) return "";

  const isoLike = value.includes("T") ? value : value.replace(" ", "T");
  const withTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(isoLike)
    ? isoLike
    : `${isoLike}Z`;
  const date = new Date(withTimeZone);

  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const serverTags = (gametype: string): Set<string> =>
  new Set(gametype.split(",").map((tag) => tag.trim()));

/**
 * Steam lists every running Deadworks server; the registry only knows the
 * registered ones but adds their country and Deadworks version, so it is
 * matched in by address. Content is not taken from either: the client asks
 * the game server itself (A2S_RULES) when the player opens the join dialog.
 */
export const normalizeDeadworksServers = (
  steam: z.output<typeof DeadworksSteamResponseSchema>,
  registry: z.output<typeof DeadworksRegistryResponseSchema> | null,
  sourceUrl: string,
  fetchedAt: Date,
): ServerBrowserEntry[] => {
  const registryByAddress = new Map(
    (registry?.servers ?? []).map((server) => [
      server.raw_address || server.address,
      server,
    ]),
  );

  return steam.servers.flatMap((raw): ServerBrowserEntry[] => {
    const tags = serverTags(raw.gametype);
    if (!tags.has(DEADWORKS_TAG) || tags.has(UNLISTED_TAG)) return [];

    const address = parseAddress(raw.addr);
    if (!address) return [];
    const port = raw.gameport ?? address.port;
    const connectCode = raw.addr.includes("[")
      ? `[${address.ip}]:${port}`
      : `${address.ip}:${port}`;

    const registered = registryByAddress.get(raw.addr);
    const sourceRegion = registered
      ? (registered.country || registered.region).trim().toLowerCase()
      : "";

    return [
      {
        id: raw.steamid,
        name: raw.name,
        ip: address.ip,
        port,
        visibility: registered?.visibility ?? "public",
        password_protected: registered?.password_protected ?? false,
        connect_code: connectCode,
        gateway_url: "",
        player_count: raw.players,
        max_players: raw.max_players,
        map: raw.map,
        game_mode: "",
        // The browser prints its own "v" prefix.
        version: registered?.version.replace(/^v/i, "") ?? "",
        players: registered?.players ?? [],
        // Display-only names; the join dialog reads the real list off the server.
        mods: registered
          ? [...registered.content_addons, ...registered.extra_maps].map(
              (name) => ({ name, version: "" }),
            )
          : [],
        required_mods: [],
        last_seen: registered?.last_heartbeat
          ? normalizeLastSeen(registered.last_heartbeat)
          : fetchedAt.toISOString(),
        auth_required: false,
        auth_providers: [],
        source_relay: sourceUrl.replace(/\/+$/, ""),
        source_region: sourceRegion || undefined,
        // Any Deadworks server may advertise maps or addons, and only the
        // server itself can say which, so every join runs a content check.
        managed_content: true,
      },
    ];
  });
};
