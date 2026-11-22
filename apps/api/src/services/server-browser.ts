import type {
  ServerBrowserEntry,
  ServerBrowserFacetsResponse,
} from "@deadlock-mods/shared";
import type { ServerListItem } from "@deadlock-mods/relay-client";
import { CACHE_TTL } from "../lib/constants";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";
import { cache } from "../lib/redis";
import { fetchDeadworksServers } from "./deadworks-registry";

const logger = mainLogger.child().withContext({
  service: "server-browser",
});

/**
 * Most registry servers report the game's default name, so surfacing the ones
 * that bothered to set a name keeps community servers from being buried under
 * an anonymous wall of "Deadlock".
 */
const DEFAULT_SERVER_NAME = "deadlock";

const hasCustomName = (name: string): boolean =>
  name.trim().toLowerCase() !== DEFAULT_SERVER_NAME;

export interface ServerBrowserFilters {
  game_mode?: string;
  has_players?: boolean;
  search?: string;
  region?: string;
  password?: boolean;
  limit?: number;
  cursor?: number;
}

export interface AggregatedServer extends ServerListItem {
  source_relay: string;
  source_region?: string;
}

export interface ServerBrowserListResult {
  servers: AggregatedServer[];
  total: number;
  cursor: number | null;
  relays_queried: number;
  relays_failed: number;
  /** The Deadworks server list couldn't be refreshed; its servers may be stale. */
  registry_degraded: boolean;
  /** Age of the stale registry snapshot in ms, if one is being served. */
  registry_snapshot_age_ms: number | null;
}

interface RegistrySnapshot {
  servers: ServerBrowserEntry[];
  fetchedAt: number;
}

interface RegistryResult {
  servers: ServerBrowserEntry[];
  degraded: boolean;
  snapshotAgeMs: number | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const normalize = (url: string) => url.replace(/\/+$/, "");

export class ServerBrowserService {
  private static instance: ServerBrowserService | null = null;

  private constructor() {}

  static getInstance(): ServerBrowserService {
    if (!ServerBrowserService.instance) {
      ServerBrowserService.instance = new ServerBrowserService();
    }
    return ServerBrowserService.instance;
  }

  async listServers(
    filters: ServerBrowserFilters = {},
  ): Promise<ServerBrowserListResult> {
    const cacheKey = this.buildListCacheKey(filters);
    const cached = await cache.get<ServerBrowserListResult>(cacheKey);
    if (cached) return cached;

    const aggregated = await this.fetchAggregated();
    const filtered = this.applyFilters(aggregated.servers, filters);

    const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = filters.cursor ?? 0;
    const page = filtered.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < filtered.length ? cursor + limit : null;

    const result: ServerBrowserListResult = {
      servers: page,
      total: filtered.length,
      cursor: nextCursor,
      relays_queried: aggregated.relaysQueried,
      relays_failed: aggregated.relaysFailed,
      registry_degraded: aggregated.registry.degraded,
      registry_snapshot_age_ms: aggregated.registry.snapshotAgeMs,
    };

    await cache.set(cacheKey, result, CACHE_TTL.SERVERS_LIST);
    return result;
  }

  async listFacets(): Promise<ServerBrowserFacetsResponse> {
    const cacheKey = "server-browser:v3:facets";
    const cached = await cache.get<ServerBrowserFacetsResponse>(cacheKey);
    if (cached) return cached;

    const aggregated = await this.fetchAggregated();

    const gameModeSet = new Set<string>();
    for (const s of aggregated.servers) {
      const mode = (s.game_mode ?? "").trim();
      if (mode) gameModeSet.add(mode);
    }
    const game_modes = Array.from(gameModeSet).sort((a, b) =>
      a.localeCompare(b),
    );

    const regionSet = new Set<string>();
    for (const s of aggregated.servers) {
      const region = (s.source_region ?? "").trim().toLowerCase();
      if (region) regionSet.add(region);
    }
    const regions = Array.from(regionSet).sort((a, b) => a.localeCompare(b));

    const result: ServerBrowserFacetsResponse = {
      game_modes,
      regions,
      relays_queried: aggregated.relaysQueried,
      relays_failed: aggregated.relaysFailed,
    };

    await cache.set(cacheKey, result, CACHE_TTL.SERVERS_FACETS);
    return result;
  }

  async getServer(id: string): Promise<AggregatedServer | null> {
    const cacheKey = `server-browser:v3:detail:${id}`;
    const cached = await cache.get<AggregatedServer>(cacheKey);
    if (cached) return cached;

    const registry = await this.fetchRegistryServers();
    const registryServer = registry.servers.find((server) => server.id === id);
    if (registryServer) {
      await cache.set(cacheKey, registryServer, CACHE_TTL.SERVER_DETAIL);
      return registryServer;
    }

    return null;
  }

  async invalidateServer(id: string): Promise<void> {
    await cache.del(`server-browser:v3:detail:${id}`);
  }

  // Relays are no longer queried: every listed server comes from Deadworks.
  // The relay counts stay in the response for clients that still read them.
  private async fetchAggregated(): Promise<{
    servers: AggregatedServer[];
    relaysQueried: number;
    relaysFailed: number;
    registry: RegistryResult;
  }> {
    const registry = await this.fetchRegistryServers();
    return {
      servers: registry.servers,
      relaysQueried: 0,
      relaysFailed: 0,
      registry,
    };
  }

  /**
   * A failed refresh must not blank the browser: the last good snapshot is
   * served instead, flagged so clients can say why it may be stale.
   */
  private async fetchRegistryServers(): Promise<RegistryResult> {
    const registryUrl = normalize(env.DEADWORKS_REGISTRY_URL);
    const listKey = `server-browser:v3:registry:${registryUrl}`;
    const snapshotKey = `${listKey}:last-good`;

    const cached = await cache.get<ServerBrowserEntry[]>(listKey);
    if (cached)
      return { servers: cached, degraded: false, snapshotAgeMs: null };

    try {
      const servers = await fetchDeadworksServers(registryUrl);
      await cache.set(listKey, servers, CACHE_TTL.SERVERS_LIST);
      await cache.set(
        snapshotKey,
        { servers, fetchedAt: Date.now() },
        CACHE_TTL.REGISTRY_SNAPSHOT,
      );
      return { servers, degraded: false, snapshotAgeMs: null };
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ registry: registryUrl })
        .warn("Deadworks server list request failed");

      const snapshot = await cache.get<RegistrySnapshot>(snapshotKey);
      if (!snapshot) {
        return { servers: [], degraded: true, snapshotAgeMs: null };
      }
      return {
        servers: snapshot.servers,
        degraded: true,
        snapshotAgeMs: Date.now() - snapshot.fetchedAt,
      };
    }
  }

  private applyFilters(
    servers: AggregatedServer[],
    filters: ServerBrowserFilters,
  ): AggregatedServer[] {
    let out = servers;

    if (filters.search) {
      const needle = filters.search.toLowerCase();
      out = out.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.map.toLowerCase().includes(needle) ||
          s.game_mode.toLowerCase().includes(needle),
      );
    }

    if (filters.region) {
      const region = filters.region.toLowerCase();
      out = out.filter((s) => s.source_region?.toLowerCase() === region);
    }

    if (filters.game_mode) {
      const gameMode = filters.game_mode.toLowerCase();
      out = out.filter((s) => s.game_mode.toLowerCase() === gameMode);
    }

    if (filters.has_players) {
      out = out.filter((s) => s.player_count > 0);
    }

    if (typeof filters.password === "boolean") {
      out = out.filter((s) => s.password_protected === filters.password);
    }

    out = [...out].sort((a, b) => {
      const aNamed = hasCustomName(a.name);
      const bNamed = hasCustomName(b.name);
      if (aNamed !== bNamed) return aNamed ? -1 : 1;
      const aPlayers = a.player_count ?? 0;
      const bPlayers = b.player_count ?? 0;
      if (aPlayers !== bPlayers) return bPlayers - aPlayers;
      return a.name.localeCompare(b.name);
    });

    return out;
  }

  private buildListCacheKey(filters: ServerBrowserFilters): string {
    const norm = {
      game_mode: filters.game_mode ?? "",
      has_players: filters.has_players ? "1" : "0",
      search: (filters.search ?? "").toLowerCase(),
      region: (filters.region ?? "").toLowerCase(),
      password:
        typeof filters.password === "boolean"
          ? filters.password
            ? "1"
            : "0"
          : "",
      limit: String(filters.limit ?? DEFAULT_LIMIT),
      cursor: String(filters.cursor ?? 0),
    };
    return `server-browser:v3:list:${JSON.stringify(norm)}`;
  }
}
