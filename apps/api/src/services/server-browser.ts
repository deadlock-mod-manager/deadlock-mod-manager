import type { ServerBrowserFacetsResponse } from "@deadlock-mods/shared";
import {
  CircuitOpenError,
  RelayHttpError,
  type ServerListItem,
} from "@deadlock-mods/relay-client";
import { CACHE_TTL } from "../lib/constants";
import { logger as mainLogger } from "../lib/logger";
import { cache } from "../lib/redis";
import {
  relayRequestDurationSeconds,
  relayRequestsTotal,
} from "../lib/relay-metrics";
import { RelayDiscoveryService } from "./relay-discovery";

const logger = mainLogger.child().withContext({
  service: "server-browser",
});

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
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const normalize = (url: string) => url.replace(/\/+$/, "");

export class ServerBrowserService {
  private static instance: ServerBrowserService | null = null;

  private constructor(
    private readonly discovery: RelayDiscoveryService = RelayDiscoveryService.getInstance(),
  ) {}

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

    const aggregated = await this.fetchAggregated(filters);
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
    };

    await cache.set(cacheKey, result, CACHE_TTL.SERVERS_LIST);
    return result;
  }

  async listFacets(): Promise<ServerBrowserFacetsResponse> {
    const cacheKey = "server-browser:v2:facets";
    const cached = await cache.get<ServerBrowserFacetsResponse>(cacheKey);
    if (cached) return cached;

    const aggregated = await this.fetchAggregated({});
    const relays = await this.discovery.getRelays();

    const gameModeSet = new Set<string>();
    for (const s of aggregated.servers) {
      const mode = (s.game_mode ?? "").trim();
      if (mode) gameModeSet.add(mode);
    }
    const game_modes = Array.from(gameModeSet).sort((a, b) =>
      a.localeCompare(b),
    );

    const regionSet = new Set<string>();
    for (const r of relays) {
      const region = (r.region ?? "").trim().toLowerCase();
      if (region) regionSet.add(region);
    }
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
    const cacheKey = `server-browser:v2:detail:${id}`;
    const cached = await cache.get<AggregatedServer>(cacheKey);
    if (cached) return cached;

    const relays = await this.discovery.getRelays();
    const client = this.discovery.getClient();

    for (const relay of relays) {
      const base = normalize(relay.url);
      if (!client.isHealthy(base)) continue;

      const stop = relayRequestDurationSeconds.startTimer({
        relay: base,
        endpoint: "get",
      });
      const startedAt = Date.now();

      try {
        const server = await client.getServer(base, id);
        const latencyMs = Date.now() - startedAt;
        stop();

        if (server) {
          relayRequestsTotal.inc({
            relay: base,
            endpoint: "get",
            outcome: "found",
          });
          await this.discovery.recordOutcome(base, {
            ok: true,
            latencyMs,
          });
          const enriched: AggregatedServer = {
            ...server,
            source_relay: base,
            source_region: relay.region,
          };
          await cache.set(cacheKey, enriched, CACHE_TTL.SERVER_DETAIL);
          return enriched;
        }

        relayRequestsTotal.inc({
          relay: base,
          endpoint: "get",
          outcome: "not_found",
        });
        await this.discovery.recordOutcome(base, { ok: true, latencyMs });
      } catch (error) {
        stop();
        relayRequestsTotal.inc({
          relay: base,
          endpoint: "get",
          outcome: "error",
        });
        await this.discovery.recordOutcome(base, {
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        if (
          !(error instanceof RelayHttpError) &&
          !(error instanceof CircuitOpenError)
        ) {
          logger.withError(error).debug("Relay get request failed");
        }
      }
    }

    return null;
  }

  async invalidateServer(id: string): Promise<void> {
    await cache.del(`server-browser:v2:detail:${id}`);
  }

  private async fetchAggregated(filters: ServerBrowserFilters): Promise<{
    servers: AggregatedServer[];
    relaysQueried: number;
    relaysFailed: number;
  }> {
    const relays = await this.discovery.getRelays();
    const client = this.discovery.getClient();

    const results = await Promise.all(
      relays.map(async (relay) => {
        const base = normalize(relay.url);
        if (!client.isHealthy(base)) {
          return { ok: false as const, base, region: relay.region };
        }

        const stop = relayRequestDurationSeconds.startTimer({
          relay: base,
          endpoint: "list",
        });
        const startedAt = Date.now();

        try {
          const response = await client.listServers(base, {
            game_mode: filters.game_mode,
            has_players: filters.has_players,
          });
          const latencyMs = Date.now() - startedAt;
          stop();

          relayRequestsTotal.inc({
            relay: base,
            endpoint: "list",
            outcome: "success",
          });
          await this.discovery.recordOutcome(base, {
            ok: true,
            latencyMs,
          });
          return {
            ok: true as const,
            base,
            region: relay.region,
            servers: response.servers,
          };
        } catch (error) {
          stop();
          relayRequestsTotal.inc({
            relay: base,
            endpoint: "list",
            outcome: "error",
          });
          await this.discovery.recordOutcome(base, {
            ok: false,
            latencyMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });
          if (
            !(error instanceof RelayHttpError) &&
            !(error instanceof CircuitOpenError)
          ) {
            logger
              .withError(error)
              .withMetadata({ relay: base })
              .debug("Relay list request failed");
          }
          return { ok: false as const, base, region: relay.region };
        }
      }),
    );

    const dedup = new Map<string, AggregatedServer>();
    let relaysQueried = 0;
    let relaysFailed = 0;

    for (const result of results) {
      if (!result.ok) {
        relaysFailed += 1;
        continue;
      }
      relaysQueried += 1;
      for (const server of result.servers) {
        const existing = dedup.get(server.id);
        if (
          !existing ||
          new Date(server.last_seen).getTime() >
            new Date(existing.last_seen).getTime()
        ) {
          dedup.set(server.id, {
            ...server,
            source_relay: result.base,
            source_region: result.region,
          });
        }
      }
    }

    return {
      servers: Array.from(dedup.values()),
      relaysQueried,
      relaysFailed,
    };
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

    if (typeof filters.password === "boolean") {
      out = out.filter((s) => s.password_protected === filters.password);
    }

    out = [...out].sort((a, b) => {
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
    return `server-browser:v2:list:${JSON.stringify(norm)}`;
  }
}
