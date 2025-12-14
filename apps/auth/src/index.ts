import "reflect-metadata";
import "./instrument";

import { prometheus } from "@hono/prometheus";
import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { logger as loggerMiddleware } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { auth } from "./lib/auth";
import { SENTRY_OPTIONS } from "./lib/constants";
import container from "./lib/container";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { HealthService } from "./services/health";

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

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));
app.get("/health", async (c) => {
  const healthService = container.resolve(HealthService);
  const result = await healthService.check();
  return c.json(result, result.status === "ok" ? 200 : 503);
});

app.get("/login", async (c, next) => {
  const returnTo = c.req.query("returnTo") || "/";
  const baseURL = env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`;

  const sessionResponse = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (sessionResponse?.session) {
    const redirectUrl = returnTo.startsWith("http")
      ? returnTo
      : `${baseURL}${returnTo.startsWith("/") ? "" : "/"}${returnTo}`;
    return c.redirect(redirectUrl);
  }

  return next();
});

app.use("/assets/*", serveStatic({ root: "./dist/client/" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

const main = async () => {
  logger.info(`Auth Server started on port ${env.PORT}`);

  Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the application");
    process.exit(1);
  });
}
