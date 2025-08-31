import { version } from '../../package.json';
import { env } from './env';
 
export const SENTRY_OPTIONS = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 1.0,
  release: `api@${version}`,
};
