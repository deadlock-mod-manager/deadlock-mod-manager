// oxlint-disable import/no-unassigned-import
import "./instrument";

import { prometheus } from "@hono/prometheus";
import { sentry } from "@hono/sentry";
import { createObservabilityStack, type AppEnv } from "@deadlock-mods/logging";
import { registerProcessHandlers } from "@deadlock-mods/instrumentation";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { featureFlagDefinitions } from "./config/feature-flags";
import { apiHandler } from "./handlers/api";
import { rpcHandler } from "./handlers/rpc";
import { SENTRY_OPTIONS, VPK_CONSTANTS } from "./lib/constants";
import { createContext } from "./lib/context";
import { env } from "./lib/env";
import { logger, loggerContext, wideEventContext } from "./lib/logger";
import artifactsRouter from "./routers/legacy/artifacts";
import customSettingsRouter from "./routers/legacy/custom-settings";
import docsRouter from "./routers/legacy/docs";
import healthRouter from "./routers/legacy/health";
import { featureFlagsService } from "./services/feature-flags";

const { printMetrics, registerMetrics } = prometheus();

const app = new Hono<AppEnv>();

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
  secureHeaders(),
  trimTrailingSlash(),
);

const observability = createObservabilityStack({
  logger,
  loggerContext,
  wideEventContext,
  requestLogger: {
    excludePaths: ["/", "/health/live", "/health/ready", "/metrics"],
  },
});

app.use("*", observability.loggerContextMiddleware);
app.use("*", observability.requestLogger);
app.onError(observability.onError);

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
      return c.newResponse(apiResult.response.body, apiResult.response);
    }

    await next();
  })
  .route("/custom-settings", customSettingsRouter)
  .route("/", healthRouter)
  .route("/docs", docsRouter)
  .route("/artifacts", artifactsRouter);

const main = async () => {
  registerProcessHandlers(logger);

  logger.info("Bootstrapping feature flags");
  const bootstrapResult = await featureFlagsService.bootstrap(
    featureFlagDefinitions,
  );

  if (bootstrapResult.isErr()) {
    logger
      .withError(bootstrapResult.error)
      .error("Failed to bootstrap feature flags");
  }

  logger.withMetadata({ port: env.PORT }).info("Server started");

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
