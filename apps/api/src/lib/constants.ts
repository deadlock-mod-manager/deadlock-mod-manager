import { version } from '../../package.json';
import { env } from './env';

export const SENTRY_OPTIONS = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 1.0,
  release: `api@${version}`,
};
export const MONITOR_SLUG = 'mods-synchronization';

// Cache configuration for mod endpoints - 4 hours cache with stale-while-revalidate
export const MODS_CACHE_CONFIG = {
  cacheName: 'deadlock-mods-api',
  cacheControl:
    'public, max-age=14400, s-maxage=14400, stale-while-revalidate=86400',
  vary: 'Accept-Encoding',
  // Default behavior: only caches 200 responses
};
