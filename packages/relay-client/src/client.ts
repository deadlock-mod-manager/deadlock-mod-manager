import { RelayHttpError } from "@deadlock-mods/common";

import { CircuitBreaker, type CircuitBreakerOptions } from "./circuit-breaker";
import {
  type RelaysManifest,
  RelaysManifestSchema,
  type RelaysResponse,
  RelaysResponseSchema,
  type ServerListItem,
  ServerListItemSchema,
  type ServersResponse,
  ServersResponseSchema,
} from "./schemas";

export interface RelayClientOptions {
  /** Per-request timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
  /** Number of attempts (including the first) before giving up. Default 2. */
  retries?: number;
  /** Base for exponential backoff between retries (ms). Default 250. */
  retryBackoffMs?: number;
  /** Optional fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
  /** Optional User-Agent string. */
  userAgent?: string;
  /** Circuit breaker config; pass null to disable. */
  circuitBreaker?: CircuitBreakerOptions | null;
}

const DEFAULT_OPTIONS: Required<
  Omit<RelayClientOptions, "fetch" | "userAgent" | "circuitBreaker">
> = {
  timeoutMs: 5000,
  retries: 2,
  retryBackoffMs: 250,
};

const DEFAULT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 3,
  cooldownMs: 60_000,
};

export class CircuitOpenError extends Error {
  constructor(public readonly relayUrl: string) {
    super(`Circuit is open for relay ${relayUrl}`);
    this.name = "CircuitOpenError";
  }
}

export { RelayHttpError };

export interface ListServersFilters {
  game_mode?: string;
  has_players?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RelayClient {
  private readonly opts: Required<
    Omit<RelayClientOptions, "fetch" | "userAgent" | "circuitBreaker">
  >;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent?: string;
  private readonly breaker: CircuitBreaker | null;

  constructor(options: RelayClientOptions = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.fetchImpl = options.fetch ?? fetch;
    this.userAgent = options.userAgent;
    const breakerOpts =
      options.circuitBreaker === null
        ? null
        : (options.circuitBreaker ?? DEFAULT_BREAKER);
    this.breaker = breakerOpts ? new CircuitBreaker(breakerOpts) : null;
  }

  isHealthy(relayUrl: string): boolean {
    if (!this.breaker) return true;
    return this.breaker.canRequest(this.normalizeBase(relayUrl));
  }

  getCircuitState(relayUrl: string) {
    if (!this.breaker) return "closed" as const;
    return this.breaker.getState(this.normalizeBase(relayUrl));
  }

  getFailureCount(relayUrl: string): number {
    if (!this.breaker) return 0;
    return this.breaker.getFailureCount(this.normalizeBase(relayUrl));
  }

  async listServers(
    relayUrl: string,
    filters: ListServersFilters = {},
  ): Promise<ServersResponse> {
    const params = new URLSearchParams();
    if (filters.game_mode) params.set("game_mode", filters.game_mode);
    if (filters.has_players) params.set("has_players", "true");
    const qs = params.toString();
    const path = `/api/v1/servers${qs ? `?${qs}` : ""}`;

    const json = await this.fetchJson(relayUrl, path);
    return ServersResponseSchema.parse(json);
  }

  async getServer(
    relayUrl: string,
    id: string,
  ): Promise<ServerListItem | null> {
    try {
      const json = await this.fetchJson(
        relayUrl,
        `/api/v1/servers/${encodeURIComponent(id)}`,
      );
      return ServerListItemSchema.parse(json);
    } catch (err) {
      if (err instanceof RelayHttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async listRelays(relayUrl: string): Promise<RelaysResponse> {
    const json = await this.fetchJson(relayUrl, "/api/v1/relays");
    return RelaysResponseSchema.parse(json);
  }

  /** Fetches the relays.json bootstrap manifest used to seed the mesh. */
  async fetchRelaysManifest(manifestUrl: string): Promise<RelaysManifest> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.userAgent) headers["User-Agent"] = this.userAgent;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await this.fetchImpl(manifestUrl, {
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new RelayHttpError(manifestUrl, res.status);
      }
      const json = await res.json();
      return RelaysManifestSchema.parse(json);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchJson(relayUrl: string, path: string): Promise<unknown> {
    const base = this.normalizeBase(relayUrl);

    if (this.breaker && !this.breaker.canRequest(base)) {
      throw new CircuitOpenError(base);
    }

    const url = `${base}${path}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.userAgent) headers["User-Agent"] = this.userAgent;

    let lastError: unknown;
    for (let attempt = 0; attempt < this.opts.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            this.breaker?.recordFailure(base);
            throw new RelayHttpError(base, res.status);
          }
          throw new RelayHttpError(base, res.status);
        }
        const json = await res.json();
        this.breaker?.recordSuccess(base);
        return json;
      } catch (err) {
        lastError = err;
        if (
          err instanceof RelayHttpError &&
          err.status >= 400 &&
          err.status < 500 &&
          err.status !== 429
        ) {
          throw err;
        }
        if (attempt < this.opts.retries - 1) {
          await sleep(this.opts.retryBackoffMs * 2 ** attempt);
        }
      } finally {
        clearTimeout(timer);
      }
    }

    this.breaker?.recordFailure(base);
    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to fetch ${url}`);
  }

  private normalizeBase(url: string): string {
    return url.replace(/\/+$/, "");
  }
}
