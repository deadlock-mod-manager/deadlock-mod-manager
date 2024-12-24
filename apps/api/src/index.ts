import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { etag } from 'hono/etag'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { trimTrailingSlash } from 'hono/trailing-slash'
import customSettings from './lib/custom-settings'
import { startJobs } from './lib/jobs'
import mods from './lib/mods'

import './lib/jobs/synchronize-mods'
const app = new Hono()

app.use(etag(), logger(), secureHeaders(), trimTrailingSlash())
app.use('*', requestId())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({
    health: 'ok'
  })
})

app.route('/mods', mods)
app.route('/custom-settings', customSettings)

startJobs()

export default {
  port: 9000,
  fetch: app.fetch
}
