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

export const normalizeDeadworksRegistryServers = (
  payload: z.output<typeof DeadworksRegistryResponseSchema>,
  sourceUrl: string,
): ServerBrowserEntry[] => {
  return payload.servers.flatMap((raw): ServerBrowserEntry[] => {
    const connectCode = raw.raw_address || raw.address;
    const address = parseAddress(connectCode);
    if (!address) return [];

    const sourceRegion = (raw.country || raw.region).trim().toLowerCase();
    return [
      {
        id: raw.id,
        name: raw.name,
        ip: address.ip,
        port: address.port,
        visibility: raw.visibility,
        password_protected: raw.password_protected,
        connect_code: connectCode,
        gateway_url: "",
        player_count: raw.player_count,
        max_players: raw.max_players,
        map: raw.map,
        game_mode: "",
        version: raw.version,
        players: raw.players,
        // Both are client-side content the player needs before joining, so
        // they belong in the same list the detail panel renders.
        mods: [...raw.content_addons, ...raw.extra_maps].map((name) => ({
          name,
          version: "",
        })),
        required_mods: [],
        last_seen: normalizeLastSeen(raw.last_heartbeat),
        auth_required: false,
        auth_providers: [],
        source_relay: sourceUrl.replace(/\/+$/, ""),
        source_region: sourceRegion || undefined,
        managed_content: true,
      },
    ];
  });
};
