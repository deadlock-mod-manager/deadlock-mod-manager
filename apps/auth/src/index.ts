// oxlint-disable-next-line import/no-unassigned-import Necessary for tsyringe
import "reflect-metadata";
// oxlint-disable-next-line import/no-unassigned-import Necessary for instrumentation
import "./instrument";

import { prometheus } from "@hono/prometheus";
import { sentry } from "@hono/sentry";
import { createObservabilityStack, type AppEnv } from "@deadlock-mods/logging";
import { registerProcessHandlers } from "@deadlock-mods/instrumentation";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { auth } from "./lib/auth";
import { SENTRY_OPTIONS } from "./lib/constants";
import container from "./lib/container";
import { env } from "./lib/env";
import { logger, loggerContext, wideEventContext } from "./lib/logger";
import { validateRedirectUrl } from "./lib/redirect";
import { createHealthRouter } from "./routes/health";
import { HealthService } from "./services/health";

const { printMetrics, registerMetrics } = prometheus();

const app = new Hono<AppEnv>();

app.route(
  "/",
  createHealthRouter({
    check: () => container.resolve(HealthService).check(),
    logger,
  }),
);

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
    excludePaths: ["/health", "/health/ready", "/metrics"],
    excludePathPrefixes: ["/assets/"],
  },
});

app.use("*", observability.loggerContextMiddleware);
app.use("*", observability.requestLogger);
app.onError(observability.onError);

app.use("*", registerMetrics);
app.get("/metrics", printMetrics);

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

app.get("/login", async (c, next) => {
  const returnTo = c.req.query("returnTo") || "/";
  const baseURL = env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`;

  const sessionResponse = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (sessionResponse?.session) {
    const safeReturnTo = validateRedirectUrl(returnTo, baseURL);
    const redirectUrl = safeReturnTo.startsWith("http")
      ? safeReturnTo
      : `${baseURL}${safeReturnTo.startsWith("/") ? "" : "/"}${safeReturnTo}`;
    return c.redirect(redirectUrl);
  }

  return next();
});

app.use("/assets/*", serveStatic({ root: "./dist/client/" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

const main = async () => {
  registerProcessHandlers(logger);

  const server = Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });

  logger.withMetadata({ port: server.port }).info("Auth server started");

  const shutdown = (signal: NodeJS.Signals) => {
    logger.withMetadata({ signal }).info("Auth server shutting down");
    server.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
