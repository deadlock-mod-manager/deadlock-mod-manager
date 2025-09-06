import './instrument';

import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { logger as loggerMiddleware } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { SENTRY_OPTIONS } from './lib/constants';
import { startJobs } from './lib/jobs';
import { logger } from './lib/logger';

import customSettingsRouter from './routes/custom-settings';
import modsRouter from './routes/mods';
import modsV1Router from './routes/v1/mods';
import modsV2Router from './routes/v2/mods';

import './lib/jobs/synchronize-mods';

const app = new Hono();

app.use(
  '*',
  sentry({
    ...SENTRY_OPTIONS,
  })
);
app.use(
  etag(),
  loggerMiddleware((message: string, ...rest: string[]) => {
    logger.info(message, ...rest);
  }),
  secureHeaders(),
  trimTrailingSlash()
);
app.use('*', requestId());
app.use('*', cors());

app.get('/', (c) => {
  return c.json({
    health: 'ok',
    version: '2.0.0',
  });
});

// Legacy routes (unchanged for backward compatibility)
app.route('/mods', modsRouter);
app.route('/custom-settings', customSettingsRouter);

// Versioned API routes
app.route('/api/v1/mods', modsV1Router);
app.route('/api/v2/mods', modsV2Router);

startJobs();

Bun.serve({
  port: 9000,
  fetch: app.fetch,
});

logger.info('Server started on port 9000');
