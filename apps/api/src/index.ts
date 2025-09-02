import './instrument';

import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { SENTRY_OPTIONS } from './lib/constants';
import { startJobs } from './lib/jobs';
import logger from './lib/logger';

import customSettingsRouter from './routes/custom-settings';
import modsRouter from './routes/mods';

import './lib/jobs/synchronize-mods';

const app = new Hono();

app.use(
  '*',
  sentry({
    ...SENTRY_OPTIONS,
  })
);
app.use(etag(), secureHeaders(), trimTrailingSlash());
app.use('*', requestId());
app.use('*', cors());

app.get('/', (c) => {
  return c.json({
    health: 'ok',
  });
});
app.route('/mods', modsRouter);
app.route('/custom-settings', customSettingsRouter);

startJobs();

Bun.serve({
  port: 9000,
  fetch: app.fetch,
});

logger.info('Server started on port 9000');
