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
  MODS_SYNCHRONIZATION = "mods-synchronization",
  GAMEBANANA_RSS = "gamebanana-rss",
}

/**
 * Cache TTL values in milliseconds.
 * Adjust these to control how long different data types are cached in Redis.
 */
export const CACHE_TTL = {
  /** Mod listing cache - 30 minutes */
  MODS_LISTING: 30 * 60 * 1000,
  /** Stats aggregation cache - 1 hour */
  STATS: 60 * 60 * 1000,
  /** Feature flags cache - 1 hour */
  FEATURE_FLAGS: 60 * 60 * 1000,
  /** Default cache TTL - 10 minutes */
  DEFAULT: 60 * 60 * 1000,
} as const;

export const MODS_CACHE_CONFIG = {
  cacheName: "deadlock-mods-api",
  cacheControl:
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600",
  vary: "Accept-Encoding",
};

export const VPK_CONSTANTS = {
  MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
  MAX_FILE_SIZE_MB: 500,
} as const;

export const SERVER_TIMEZONE = env.TZ;

export const GAMEBANANA_RSS_FEED_URL =
  "https://api.gamebanana.com/Rss/New?gameid=20948";
