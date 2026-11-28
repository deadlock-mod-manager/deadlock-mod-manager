// oxlint-disable import/no-unassigned-import
import "./instrument";

import { db, ModDownloadRepository } from "@deadlock-mods/database";
import { sentry } from "@hono/sentry";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { etag } from "hono/etag";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { SENTRY_OPTIONS } from "./lib/constants";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { createDownloadRouter } from "./routers/download";
import healthRouter from "./routers/health";
import metricsRouter from "./routers/metrics";

const app = new Hono();

app.use(
  "*",
  requestId(),
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
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

const downloads = new ModDownloadRepository(db);
app.route("/", healthRouter);
app.route(
  "/download",
  createDownloadRouter(
    (modId, fileId) => downloads.findByModIdAndFileId(modId, fileId),
    logger,
  ),
);
app.route("/metrics", metricsRouter);

if (import.meta.main) {
  Bun.serve({
    port: env.PORT,
    fetch: app.fetch,
  });
  logger.info(`Download redirect service started on port ${env.PORT}`);
}
