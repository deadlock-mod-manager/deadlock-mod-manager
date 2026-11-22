import { version } from "@/version";
import { env } from "./env";

export const SENTRY_OPTIONS = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 0.01,
  release: `api@${version}`,
  skipOpenTelemetrySetup: true,
};

export enum MonitorSlug {
  MODS_SYNCHRONIZATION = "mods-synchronization",
  RELAY_DISCOVERY = "relay-discovery",
  OAUTH_TOKEN_CLEANUP = "oauth-token-cleanup",
}

export const CACHE_TTL = {
  MODS_LISTING: 30 * 60 * 1000,
  STATS: 60 * 60 * 1000,
  FEATURE_FLAGS: 60 * 60 * 1000,
  REPORT_COUNTS: 7 * 24 * 60 * 60 * 1000,
  FILESERVER_GEO: 7 * 24 * 60 * 60 * 1000,
  SERVERS_LIST: 10 * 1000,
  SERVERS_FACETS: 60 * 1000,
  SERVER_DETAIL: 30 * 1000,
  REGISTRY_SNAPSHOT: 3 * 60 * 60 * 1000,
  RELAYS_MANIFEST: 10 * 60 * 1000,
  RELAYS_HEALTH: 24 * 60 * 60 * 1000,
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
