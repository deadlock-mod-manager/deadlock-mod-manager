import { version } from '../../package.json'

export const SENTRY_DSN = 'https://68ca3d16310ec3b252293d44ecf5fe21@o84215.ingest.us.sentry.io/4508546052915200'
export const NODE_ENV = Bun.env.NODE_ENV ?? 'production'
export const SENTRY_ENVIRONMENT = `api-${NODE_ENV}`

export const SENTRY_OPTIONS = {
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 1.0,
  release: `api@${version}`
}
