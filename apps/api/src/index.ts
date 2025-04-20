import './instrument'

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { trimTrailingSlash } from 'hono/trailing-slash'
import customSettingsRouter from './lib/custom-settings'
import { startJobs } from './lib/jobs'
import modsRouter from './lib/mods'

import { sentry } from '@hono/sentry'
import { SENTRY_OPTIONS } from './lib/constants'
import './lib/jobs/synchronize-mods'

const app = new Hono()

app.use(
  '*',
  sentry({
    ...SENTRY_OPTIONS
  })
)
app.use(etag(), logger(), secureHeaders(), trimTrailingSlash())
app.use('*', requestId())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({
    health: 'ok'
  })
})
app.route('/mods', modsRouter)
app.route('/custom-settings', customSettingsRouter)

startJobs()

export default {
  port: 9000,
  fetch: app.fetch
}
