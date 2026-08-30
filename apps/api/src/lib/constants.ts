import { version } from "@/version";
import { env } from "./env";

export const SENTRY_OPTIONS = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 0.01,
  release: `api@${version}`,
  skipOpenTelemetrySetup: true, // Skip OpenTelemetry setup, we'll use our own.
};

export enum MonitorSlug {
  RELAY_DISCOVERY = "relay-discovery",
}

/**
 * Cache TTL values in milliseconds.
 * Adjust these to control how long different data types are cached in Redis.
 */
export const CACHE_TTL = {
  /** Stats aggregation cache - 1 hour */
  STATS: 60 * 60 * 1000,
  /** Feature flags cache - 1 hour */
  FEATURE_FLAGS: 60 * 60 * 1000,
  /** Report counts cache - 7 days */
  REPORT_COUNTS: 7 * 24 * 60 * 60 * 1000,
  /** Fileserver geolocation cache - 7 days */
  FILESERVER_GEO: 7 * 24 * 60 * 60 * 1000,
  /** Server browser - aggregated server list TTL (10s) */
  SERVERS_LIST: 10 * 1000,
  /** Server browser - facet options (game modes, regions) TTL (60s) */
  SERVERS_FACETS: 60 * 1000,
  /** Server browser - single server detail TTL (30s) */
  SERVER_DETAIL: 30 * 1000,
  /**
   * Server browser - last-good Deadworks registry snapshot (3h). Registry
   * outages have lasted until a provider quota reset, so the window has to
   * outlive one; responses carry the snapshot's age so the UI can say it's stale.
   */
  REGISTRY_SNAPSHOT: 3 * 60 * 60 * 1000,
  /** Server browser - relays.json manifest TTL (10 min) */
  RELAYS_MANIFEST: 10 * 60 * 1000,
  /** Relay mesh health snapshot TTL (1 day) */
  RELAYS_HEALTH: 24 * 60 * 60 * 1000,
  /** Default cache TTL - 10 minutes */
  DEFAULT: 60 * 60 * 1000,
} as const;

export const VPK_CONSTANTS = {
  MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
  MAX_FILE_SIZE_MB: 500,
} as const;

export const SERVER_TIMEZONE = env.TZ;
