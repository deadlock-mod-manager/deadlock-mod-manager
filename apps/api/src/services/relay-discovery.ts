import {
  RelayClient,
  type RelaysManifestEntry,
} from "@deadlock-mods/relay-client";
import { version } from "@/version";
import { CACHE_TTL } from "../lib/constants";
import { env } from "../lib/env";
import { logger as mainLogger } from "../lib/logger";
import { redis } from "../lib/redis";
import { relayManifestRefreshTotal } from "../lib/relay-metrics";

const logger = mainLogger.child().withContext({
  service: "relay-discovery",
});

const REDIS_MANIFEST_KEY = "relay-mesh:manifest";
const REDIS_HEALTH_PREFIX = "relay-mesh:health:";
const HEALTH_TTL_SECONDS = 5 * 60;

export interface RelayHealthSnapshot {
  url: string;
  region?: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
}

interface StoredHealth {
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
}

const FAILURE_THRESHOLD = 3;

/**
 * Owns the relay mesh state used by the server browser:
 *  - Periodically pulls the bootstrap relays.json manifest.
 *  - Caches it in Redis so a transient fetch failure doesn't take the
 *    server browser offline.
 *  - Tracks per-relay health (rolling failure count + last success/error).
 */
export class RelayDiscoveryService {
  private static instance: RelayDiscoveryService | null = null;

  private readonly client: RelayClient;
  private cachedManifest: RelaysManifestEntry[] | null = null;
  private cachedAt = 0;

  private constructor() {
    this.client = new RelayClient({
      timeoutMs: 5_000,
      retries: 2,
      userAgent: `deadlock-mod-manager-api/${version}`,
    });
  }

  static getInstance(): RelayDiscoveryService {
    if (!RelayDiscoveryService.instance) {
      RelayDiscoveryService.instance = new RelayDiscoveryService();
    }
    return RelayDiscoveryService.instance;
  }

  getClient(): RelayClient {
    return this.client;
  }

  async getRelays(): Promise<RelaysManifestEntry[]> {
    if (this.cachedManifest) {
      return this.filterForEnv(this.cachedManifest);
    }

    const fromRedis = await this.loadManifestFromRedis();
    if (fromRedis) {
      this.cachedManifest = fromRedis;
      return this.filterForEnv(fromRedis);
    }

    // First-run cold start: try to fetch synchronously so the API has at
    // least one relay to query. Cron will keep us fresh from then on.
    try {
      await this.refreshManifest();
    } catch (error) {
      logger
        .withError(error)
        .error("Initial relay manifest fetch failed; serving empty list");
      return [];
    }

    return this.filterForEnv(this.cachedManifest ?? []);
  }

  async refreshManifest(): Promise<RelaysManifestEntry[]> {
    const url = env.RELAYS_JSON_URL;
    logger.withMetadata({ url }).debug("Refreshing relay manifest");

    try {
      const manifest = await this.client.fetchRelaysManifest(url);
      this.cachedManifest = manifest.relays;
      this.cachedAt = Date.now();

      await redis.set(
        REDIS_MANIFEST_KEY,
        JSON.stringify(manifest.relays),
        "PX",
        CACHE_TTL.RELAYS_MANIFEST,
      );

      logger
        .withMetadata({ count: manifest.relays.length })
        .info("Relay manifest refreshed");

      relayManifestRefreshTotal.inc({ outcome: "success" });
      return manifest.relays;
    } catch (error) {
      relayManifestRefreshTotal.inc({ outcome: "failure" });
      throw error;
    }
  }

  async recordOutcome(
    relayUrl: string,
    outcome:
      | { ok: true; latencyMs: number }
      | { ok: false; latencyMs?: number; error: string },
  ): Promise<void> {
    const key = this.healthKey(relayUrl);
    const existing = await this.readHealth(relayUrl);
    const now = new Date().toISOString();

    const next: StoredHealth = outcome.ok
      ? {
          consecutiveFailures: 0,
          lastSuccessAt: now,
          lastErrorAt: existing?.lastErrorAt,
          lastLatencyMs: outcome.latencyMs,
          lastError: undefined,
        }
      : {
          consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
          lastSuccessAt: existing?.lastSuccessAt,
          lastErrorAt: now,
          lastLatencyMs: outcome.latencyMs ?? existing?.lastLatencyMs,
          lastError: outcome.error,
        };

    await redis.set(key, JSON.stringify(next), "EX", HEALTH_TTL_SECONDS);
  }

  async getHealthSnapshot(): Promise<RelayHealthSnapshot[]> {
    const relays = await this.getRelays();
    return Promise.all(
      relays.map(async (relay) => {
        const health = await this.readHealth(relay.url);
        const consecutiveFailures = health?.consecutiveFailures ?? 0;
        return {
          url: relay.url,
          region: relay.region,
          healthy: consecutiveFailures < FAILURE_THRESHOLD,
          consecutiveFailures,
          lastSuccessAt: health?.lastSuccessAt,
          lastErrorAt: health?.lastErrorAt,
          lastLatencyMs: health?.lastLatencyMs,
          lastError: health?.lastError,
        };
      }),
    );
  }

  private async loadManifestFromRedis(): Promise<RelaysManifestEntry[] | null> {
    try {
      const raw = await redis.get(REDIS_MANIFEST_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as RelaysManifestEntry[];
    } catch (error) {
      logger.withError(error).warn("Failed to read relay manifest from Redis");
      return null;
    }
  }

  private async readHealth(relayUrl: string): Promise<StoredHealth | null> {
    try {
      const raw = await redis.get(this.healthKey(relayUrl));
      if (!raw) return null;
      return JSON.parse(raw) as StoredHealth;
    } catch (error) {
      logger.withError(error).debug("Failed to read relay health");
      return null;
    }
  }

  private healthKey(relayUrl: string): string {
    return `${REDIS_HEALTH_PREFIX}${this.normalize(relayUrl)}`;
  }

  private normalize(url: string): string {
    return url.replace(/\/+$/, "");
  }

  private filterForEnv(relays: RelaysManifestEntry[]): RelaysManifestEntry[] {
    if (env.NODE_ENV === "production") {
      return relays.filter((r) => r.region !== "local");
    }
    return relays;
  }

  static __resetForTests(): void {
    RelayDiscoveryService.instance = null;
  }

  get cacheAge(): number {
    return this.cachedAt === 0 ? -1 : Date.now() - this.cachedAt;
  }
}
