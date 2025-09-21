import { version } from "../../package.json";
import { env } from "./env";

export const SENTRY_OPTIONS = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 1.0,
  release: `api@${version}`,
};
export const MONITOR_SLUG = "mods-synchronization";

export enum MonitorSlug {
  MODS_SYNCHRONIZATION = "mods-synchronization",
  GAMEBANANA_RSS = "gamebanana-rss",
}

// Cache configuration for mod endpoints - 1 hour cache with stale-while-revalidate (aligned with hourly sync)
export const MODS_CACHE_CONFIG = {
  cacheName: "deadlock-mods-api",
  cacheControl:
    "public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600",
  vary: "Accept-Encoding",
  // Default behavior: only caches 200 responses
};

// VPK file processing constants
export const VPK_CONSTANTS = {
  // Maximum file size: 500MB (matches server body limit)
  MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
  MAX_FILE_SIZE_MB: 500,
} as const;

export const SERVER_TIMEZONE = env.TZ;
