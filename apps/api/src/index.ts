import './instrument';

import { sentry } from '@hono/sentry';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { logger as loggerMiddleware } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { MODS_CACHE_CONFIG, SENTRY_OPTIONS } from './lib/constants';
import { startJobs } from './lib/jobs';
import { logger } from './lib/logger';
import { version } from './version';
import './lib/jobs/synchronize-mods';
import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { auth } from './lib/auth';
import { createContext } from './lib/context';
import { HealthService } from './lib/services/health';
import { appRouter } from './routers';

const app = new Hono();

app.use(
  '*',
  requestId(),
  cors(),
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

app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      logger.withError(error).error('Error handling API request');
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      logger.withError(error).error('Error handling RPC request');
    }),
  ],
});

app.use('/rpc/*', async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: '/rpc',
    context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  await next();
});

app.use('/api/*', async (c, next) => {
  const context = await createContext({ context: c });

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: '/api',
    context,
  });

  if (apiResult.matched) {
    const response = c.newResponse(apiResult.response.body, apiResult.response);

    // Add cache headers for mod endpoints only
    if (c.req.path.includes('/mods')) {
      response.headers.set('Cache-Control', MODS_CACHE_CONFIG.cacheControl);
      response.headers.set('Vary', MODS_CACHE_CONFIG.vary);
    }

    return response;
  }

  await next();
});

app.get('/', async (c) => {
  const service = HealthService.getInstance();
  const result = await service.check();
  return c.json(
    { ...result, version, spec: '/api/openapi.json' },
    result.status === 'ok' ? 200 : 503
  );
});

app.get('/api/openapi.json', async (c) => {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });

  const spec = await generator.generate(appRouter, {
    info: {
      title: 'Deadlock Mods API',
      version,
      description: 'API powering the Deadlock Mod Manager',
    },
    servers: [
      {
        url: 'https://api.deadlock-mods.com',
        description: 'Production server',
      },
      {
        url: 'http://localhost:9000',
        description: 'Development server',
      },
    ],
  });

  return c.json(spec);
});

startJobs();

Bun.serve({
  port: 9000,
  fetch: app.fetch,
});

logger.info('Server started on port 9000');
