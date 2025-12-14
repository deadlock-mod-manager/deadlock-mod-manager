import "./instrument";

import { prometheus } from "@hono/prometheus";
import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { logger as loggerMiddleware } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { featureFlagDefinitions } from "./config/feature-flags";
import { apiHandler } from "./handlers/api";
import { rpcHandler } from "./handlers/rpc";
import {
  MODS_CACHE_CONFIG,
  SENTRY_OPTIONS,
  VPK_CONSTANTS,
} from "./lib/constants";
import { createContext } from "./lib/context";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { GamebananaRssProcessor } from "./processors/gamebanana-rss-processor";
import { ModsSyncProcessor } from "./processors/mods-sync";
import artifactsRouter from "./routers/legacy/artifacts";
import customSettingsRouter from "./routers/legacy/custom-settings";
import docsRouter from "./routers/legacy/docs";
import healthRouter from "./routers/legacy/health";
import modsRouter from "./routers/legacy/mods";
import redirectRouter from "./routers/redirect";
import { cronService } from "./services/cron";
import { featureFlagsService } from "./services/feature-flags";

const { printMetrics, registerMetrics } = prometheus();

const app = new Hono();

app.use(
  "*",
  requestId(),
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
  sentry({
    ...SENTRY_OPTIONS,
  }),
  etag(),
  loggerMiddleware((message: string, ...rest: string[]) => {
    logger.info(message, ...rest);
  }),
  secureHeaders(),
  trimTrailingSlash(),
);

app.use("*", registerMetrics);
app.get("/metrics", printMetrics);

app
  .use("/rpc/*", async (c, next) => {
    const context = await createContext({ context: c });

    const rpcResult = await rpcHandler.handle(c.req.raw, {
      prefix: "/rpc",
      context,
    });

    if (rpcResult.matched) {
      return c.newResponse(rpcResult.response.body, rpcResult.response);
    }

    await next();
  })
  .use("/api/*", async (c, next) => {
    const context = await createContext({ context: c });

    const apiResult = await apiHandler.handle(c.req.raw, {
      prefix: "/api",
      context,
    });

    if (apiResult.matched) {
      const response = c.newResponse(
        apiResult.response.body,
        apiResult.response,
      );

      if (c.req.path.includes("/mods")) {
        response.headers.set("Cache-Control", MODS_CACHE_CONFIG.cacheControl);
        response.headers.set("Vary", MODS_CACHE_CONFIG.vary);
      }

      return response;
    }

    await next();
  })
  .route("/mods", modsRouter)
  .route("/custom-settings", customSettingsRouter)
  .route("/", healthRouter)
  .route("/docs", docsRouter)
  .route("/redirect", redirectRouter)
  .route("/artifacts", artifactsRouter);

const main = async () => {
  logger.info("Bootstrapping feature flags");
  const bootstrapResult = await featureFlagsService.bootstrap(
    featureFlagDefinitions,
  );

  if (bootstrapResult.isErr()) {
    logger
      .withError(bootstrapResult.error)
      .error("Failed to bootstrap feature flags");
  }

  logger.info("Defining cron jobs");
  await cronService.defineJob({
    name: ModsSyncProcessor.name,
    pattern: ModsSyncProcessor.cronPattern,
    processor: ModsSyncProcessor.getInstance(),
    enabled: true,
  });

  await cronService.defineJob({
    name: GamebananaRssProcessor.name,
    pattern: GamebananaRssProcessor.cronPattern,
    processor: GamebananaRssProcessor.getInstance(),
    enabled: true,
  });

  process.on("SIGTERM", async () => {
    await Promise.all([cronService.shutdown()]);
  });

  logger.info(`Server started on port ${env.PORT}`);

  Bun.serve({
    port: 9000,
    fetch: app.fetch,
    maxRequestBodySize: VPK_CONSTANTS.MAX_FILE_SIZE_BYTES,
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
